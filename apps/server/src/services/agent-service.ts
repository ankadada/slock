import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { prisma } from "../lib/prisma.js";
import { getProviderConfig } from "../routes/settings.js";
import type { ServerToClientEvents, ClientToServerEvents, ToolDefinition, ThinkingLevel } from "@slock/shared";
import {
  executeSkill,
  convertToAnthropicTools,
  convertToOpenAITools,
} from "../skills/index.js";
import type { SkillResult } from "../skills/index.js";

const MAX_AGENT_TURNS = 3;
const MAX_TOOL_CALLS_PER_TURN = 5;
const MAX_MEMORIES_PER_AGENT_CHANNEL = 50;

/**
 * Cooldown tracking for agent-to-agent mentions.
 * Key: `${agentId}:${channelId}`, Value: timestamp (ms) of last agent-triggered response.
 * Human @mentions bypass this cooldown entirely.
 */
const agentCooldowns = new Map<string, number>();
const AGENT_COOLDOWN_MS = 30_000; // 30 seconds

/**
 * Check if an agent is in cooldown for agent-triggered mentions in a channel.
 */
function isAgentInCooldown(agentId: string, channelId: string): boolean {
  const key = `${agentId}:${channelId}`;
  const lastTriggered = agentCooldowns.get(key);
  if (!lastTriggered) return false;
  return Date.now() - lastTriggered < AGENT_COOLDOWN_MS;
}

/**
 * Record that an agent just responded to an agent-triggered mention.
 */
function setAgentCooldown(agentId: string, channelId: string): void {
  const key = `${agentId}:${channelId}`;
  agentCooldowns.set(key, Date.now());
}

const THINKING_BUDGET_MAP: Record<string, number> = { low: 1024, medium: 4096, high: 16384 };

/**
 * Stream a response from the appropriate AI provider.
 * Returns an async generator of text chunks.
 */
async function* streamAIResponse(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  thinkingLevel?: string
): AsyncGenerator<string> {
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(
      `API key for provider "${provider}" not configured. Go to Settings to add it.`
    );
  }

  if (provider === "anthropic") {
    const client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const streamParams: any = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [{ role: "user", content: "Hello" }],
    };
    if (thinkingLevel && thinkingLevel !== "none" && THINKING_BUDGET_MAP[thinkingLevel]) {
      streamParams.thinking = { type: "enabled", budget_tokens: THINKING_BUDGET_MAP[thinkingLevel] };
      // When thinking is enabled, max_tokens must be larger to accommodate thinking + response
      streamParams.max_tokens = THINKING_BUDGET_MAP[thinkingLevel] + 4096;
    }
    const stream = client.messages.stream(streamParams);
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  } else {
    // OpenAI or OpenAI-compatible
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const streamParams: any = {
      model,
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    };
    // For OpenAI o-series models, add reasoning_effort
    if (thinkingLevel && thinkingLevel !== "none" && model.startsWith("o")) {
      const effortMap: Record<string, string> = { low: "low", medium: "medium", high: "high" };
      streamParams.reasoning_effort = effortMap[thinkingLevel] || "medium";
    }
    const stream = await client.chat.completions.create(streamParams);
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

/**
 * Make a non-streaming AI call. Used for lightweight evaluation (YES/NO decisions).
 * Returns the full text response.
 */
async function callAINonStreaming(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  thinkingLevel?: string
): Promise<string> {
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(`API key for provider "${provider}" not configured.`);
  }

  if (provider === "anthropic") {
    const client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const createParams: any = {
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [{ role: "user", content: "Hello" }],
    };
    if (thinkingLevel && thinkingLevel !== "none" && THINKING_BUDGET_MAP[thinkingLevel]) {
      createParams.thinking = { type: "enabled", budget_tokens: THINKING_BUDGET_MAP[thinkingLevel] };
      createParams.max_tokens = THINKING_BUDGET_MAP[thinkingLevel] + 2048;
    }
    const response = await client.messages.create(createParams);
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } else {
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const createParams: any = {
      model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    };
    if (thinkingLevel && thinkingLevel !== "none" && model.startsWith("o")) {
      const effortMap: Record<string, string> = { low: "low", medium: "medium", high: "high" };
      createParams.reasoning_effort = effortMap[thinkingLevel] || "medium";
    }
    const response = await client.chat.completions.create(createParams);
    return response.choices[0]?.message?.content || "";
  }
}

/**
 * Parse agent tools from DB JSON string.
 */
function parseAgentTools(toolsJson: string | null): ToolDefinition[] {
  if (!toolsJson) return [];
  try {
    const parsed = JSON.parse(toolsJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    return parsed.filter(
      (t: unknown) =>
        typeof t === "object" &&
        t !== null &&
        "name" in t &&
        "executorKey" in t
    ) as ToolDefinition[];
  } catch {
    return [];
  }
}

/**
 * Run a tool-aware agent turn.
 * Handles the full tool-use loop:
 *  1. Call AI with tools declared
 *  2. If response contains tool_use -> execute via skill registry -> inject result -> loop
 *  3. If response is text -> emit it
 *  4. Max MAX_TOOL_CALLS_PER_TURN tool calls per turn
 *
 * Returns { messageId, fullContent } of the agent's response.
 */
async function runAgentTurn(
  agent: {
    id: string;
    name: string;
    role: string;
    avatar?: string | null;
    provider: string;
    model: string;
    systemPrompt: string;
    tools?: string | null;
    thinkingLevel?: string;
  },
  channelId: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<{ messageId: string; fullContent: string }> {
  const tools = parseAgentTools(agent.tools ?? null);
  if (tools.length === 0) {
    return await runSimpleStream(agent, channelId, systemPrompt, messages, io);
  }

  const provider = agent.provider || "anthropic";
  const model = agent.model || "claude-sonnet-4-6";
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(`API key for provider "${provider}" not configured.`);
  }

  const messageId = uuid();
  let fullContent = "";
  let toolCallCount = 0;

  if (provider === "anthropic") {
    const client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const anthropicTools = convertToAnthropicTools(tools);

    type AnthropicMsg = Anthropic.MessageParam;
    const anthropicMessages: AnthropicMsg[] =
      messages.length > 0
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: "user", content: "Hello" }];

    while (toolCallCount < MAX_TOOL_CALLS_PER_TURN) {
      const createParams: any = {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools,
      };
      if (agent.thinkingLevel && agent.thinkingLevel !== "none" && THINKING_BUDGET_MAP[agent.thinkingLevel]) {
        createParams.thinking = { type: "enabled", budget_tokens: THINKING_BUDGET_MAP[agent.thinkingLevel] };
        createParams.max_tokens = THINKING_BUDGET_MAP[agent.thinkingLevel] + 4096;
      }
      const response = await client.messages.create(createParams);

      const assistantContent: Anthropic.ContentBlock[] = response.content;
      let hasToolUse = false;

      for (const block of assistantContent) {
        if (block.type === "text") {
          fullContent += block.text;
          io.to(channelId).emit("agent:stream", {
            agentId: agent.id,
            channelId,
            messageId,
            chunk: block.text,
            done: false,
          });
        }
      }

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          hasToolUse = true;
          toolCallCount++;

          const toolDef = tools.find((t) => t.name === block.name);
          const executorKey = toolDef?.executorKey || block.name;

          const skillResult = await executeSkill(
            executorKey,
            block.input as Record<string, unknown>,
            { agentId: agent.id, channelId, provider, model }
          );

          io.to(channelId).emit("agent:tool_use", {
            agentId: agent.id,
            channelId,
            messageId,
            toolName: block.name,
            args: block.input as Record<string, unknown>,
            result: skillResult,
          });

          anthropicMessages.push({ role: "assistant", content: assistantContent });
          anthropicMessages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: skillResult.text,
              },
            ],
          });
        }
      }

      if (!hasToolUse || response.stop_reason === "end_turn") break;
    }
  } else {
    // OpenAI / OpenAI-compatible
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const openaiTools = convertToOpenAITools(tools);

    type OpenAIMsg = OpenAI.ChatCompletionMessageParam;
    const openaiMessages: OpenAIMsg[] = [
      { role: "system", content: systemPrompt },
      ...messages.map(
        (m) => ({ role: m.role, content: m.content }) as OpenAIMsg
      ),
    ];

    while (toolCallCount < MAX_TOOL_CALLS_PER_TURN) {
      const openaiCreateParams: any = {
        model,
        max_tokens: 4096,
        messages: openaiMessages,
        tools: openaiTools,
      };
      if (agent.thinkingLevel && agent.thinkingLevel !== "none" && model.startsWith("o")) {
        const effortMap: Record<string, string> = { low: "low", medium: "medium", high: "high" };
        openaiCreateParams.reasoning_effort = effortMap[agent.thinkingLevel] || "medium";
      }
      const response = await client.chat.completions.create(openaiCreateParams);

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMsg = choice.message;

      if (assistantMsg.content) {
        fullContent += assistantMsg.content;
        io.to(channelId).emit("agent:stream", {
          agentId: agent.id,
          channelId,
          messageId,
          chunk: assistantMsg.content,
          done: false,
        });
      }

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        openaiMessages.push(assistantMsg as OpenAIMsg);

        for (const toolCall of assistantMsg.tool_calls) {
          if (toolCall.type !== "function") continue;
          toolCallCount++;

          const fn = (toolCall as { type: "function"; id: string; function: { name: string; arguments: string } }).function;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(fn.arguments);
          } catch {
            // ignore parse error
          }

          const toolDef = tools.find((t) => t.name === fn.name);
          const executorKey = toolDef?.executorKey || fn.name;

          const skillResult = await executeSkill(executorKey, parsedArgs, {
            agentId: agent.id,
            channelId,
            provider,
            model,
          });

          io.to(channelId).emit("agent:tool_use", {
            agentId: agent.id,
            channelId,
            messageId,
            toolName: fn.name,
            args: parsedArgs,
            result: skillResult,
          });

          openaiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: skillResult.text,
          });
        }
      } else {
        break;
      }

      if (choice.finish_reason === "stop") break;
    }
  }

  io.to(channelId).emit("agent:stream", {
    agentId: agent.id,
    channelId,
    messageId,
    chunk: "",
    done: true,
  });

  return { messageId, fullContent };
}

/**
 * Simple streaming fallback (no tools).
 * Returns { messageId, fullContent }.
 */
async function runSimpleStream(
  agent: {
    id: string;
    name: string;
    role: string;
    avatar?: string | null;
    provider: string;
    model: string;
    thinkingLevel?: string;
  },
  channelId: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<{ messageId: string; fullContent: string }> {
  const messageId = uuid();
  let fullContent = "";

  const aiMessages =
    messages.length > 0 ? messages : [{ role: "user" as const, content: "Hello" }];

  const stream = streamAIResponse(
    agent.provider || "anthropic",
    agent.model || "claude-sonnet-4-6",
    systemPrompt,
    aiMessages,
    agent.thinkingLevel
  );

  for await (const chunk of stream) {
    fullContent += chunk;
    io.to(channelId).emit("agent:stream", {
      agentId: agent.id,
      channelId,
      messageId,
      chunk,
      done: false,
    });
  }

  io.to(channelId).emit("agent:stream", {
    agentId: agent.id,
    channelId,
    messageId,
    chunk: "",
    done: true,
  });

  return { messageId, fullContent };
}

/**
 * Parse @mentions from message content.
 * Matches @word patterns, returns unique lowercase names.
 */
function parseMentions(content: string): string[] {
  const matches = content.match(/@(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

/**
 * Parse UI components from agent response.
 * Looks for ```ui\n{json}\n``` blocks.
 */
function parseUIComponents(content: string): { cleanContent: string; uiComponent?: any } {
  const uiBlockRegex = /```ui\n([\s\S]*?)```/;
  const match = content.match(uiBlockRegex);

  if (!match) return { cleanContent: content };

  try {
    const uiComponent = JSON.parse(match[1]);
    uiComponent.id = uiComponent.id || uuid();
    const cleanContent = content.replace(uiBlockRegex, "").trim();
    return { cleanContent, uiComponent };
  } catch {
    return { cleanContent: content };
  }
}

/**
 * Build conversation context from recent messages.
 * For multi-agent channels, only this agent's messages are "assistant", others are "user".
 */
async function buildContext(
  channelId: string,
  currentAgentId: string,
  limit = 20
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const messages = await prisma.message.findMany({
    where: { channelId },
    include: {
      user: { select: { username: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse().map((msg) => {
    const sender = msg.user?.username || msg.agent?.name || "System";
    // Only this agent's own messages are "assistant", all others are "user"
    const isOwnMessage = msg.type === "agent" && msg.agentId === currentAgentId;
    return {
      role: (isOwnMessage ? "assistant" : "user") as "user" | "assistant",
      content: `[${sender}]: ${msg.content}`,
    };
  });
}

/**
 * Fetch agent memories for a channel.
 */
async function getAgentMemories(agentId: string, channelId: string): Promise<string> {
  const memories = await prisma.agentMemory.findMany({
    where: { agentId, channelId },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  if (memories.length === 0) return "";

  return (
    "\n\nYour memories from this channel:\n" +
    memories.map((m) => `- ${m.key}: ${m.content}`).join("\n")
  );
}

/**
 * Store agent memory after a conversation.
 */
async function storeMemory(agentId: string, channelId: string, key: string, content: string): Promise<void> {
  await prisma.agentMemory.upsert({
    where: {
      agentId_channelId_key: { agentId, channelId, key },
    },
    update: { content },
    create: { agentId, channelId, key, content },
  });
}

/**
 * Use a lightweight AI call to extract key facts worth remembering from a conversation.
 * Stores distilled memories (not raw conversation) and rotates oldest entries.
 */
async function updateMemories(
  agentId: string,
  channelId: string,
  provider: string,
  model: string,
  conversation: string
): Promise<void> {
  try {
    const extractionPrompt =
      `You are a memory extraction assistant. Analyze the following conversation and extract key facts worth remembering.` +
      `\n\nCategories: user_preferences, project_context, decisions, action_items` +
      `\n\nConversation:\n${conversation}` +
      `\n\nExtract 0-3 key facts. For each fact, output one line in the format:` +
      `\ncategory|short_key|fact` +
      `\n\nExample:` +
      `\ndecisions|auth_method|Team decided to use JWT for authentication` +
      `\naction_items|api_docs|Need to write API documentation by Friday` +
      `\n\nIf there are no meaningful facts to extract, output "NONE".`;

    const result = await callAINonStreaming(provider, model, extractionPrompt, [
      { role: "user", content: "Extract memories from the conversation above." },
    ]);

    const trimmed = result.trim();
    if (trimmed === "NONE" || trimmed.length === 0) return;

    const lines = trimmed.split("\n").filter((l) => l.includes("|"));
    for (const line of lines.slice(0, 3)) {
      const parts = line.split("|");
      if (parts.length < 3) continue;
      const [category, shortKey, ...factParts] = parts;
      const key = `${category!.trim()}_${shortKey!.trim()}`;
      const content = factParts.join("|").trim();
      if (key && content) {
        await storeMemory(agentId, channelId, key, content);
      }
    }

    // Rotate: keep only the newest MAX_MEMORIES_PER_AGENT_CHANNEL entries
    const allMemories = await prisma.agentMemory.findMany({
      where: { agentId, channelId },
      orderBy: { updatedAt: "desc" },
    });
    if (allMemories.length > MAX_MEMORIES_PER_AGENT_CHANNEL) {
      const toDelete = allMemories.slice(MAX_MEMORIES_PER_AGENT_CHANNEL);
      await prisma.agentMemory.deleteMany({
        where: { id: { in: toDelete.map((m) => m.id) } },
      });
    }
  } catch (err) {
    // Memory extraction is best-effort; don't fail the main flow
    console.error(`Memory extraction failed for agent ${agentId}:`, err);
  }
}

/**
 * Small helper to sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an agent has the "auto_respond" capability.
 */
function hasAutoRespondCapability(agent: { capabilities?: string | null }): boolean {
  if (!agent.capabilities) return false;
  try {
    const caps: string[] = JSON.parse(agent.capabilities as string);
    return caps.includes("auto_respond");
  } catch {
    return false;
  }
}

/**
 * Autonomous agent evaluation and response.
 * Every message in a channel is evaluated by all agents that have the "auto_respond" capability.
 * Each agent independently decides if the message is relevant to its expertise and responds if so.
 */
export async function evaluateAndRespond(
  content: string,
  channelId: string,
  userId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  // Get all agents in this channel
  const channelAgents = await prisma.channelAgent.findMany({
    where: { channelId },
    include: { agent: true },
  });

  const autoRespondAgents = channelAgents.filter(
    (ca) => ca.agent.isActive && hasAutoRespondCapability(ca.agent)
  );

  if (autoRespondAgents.length === 0) return;

  // Fetch recent messages for context (last 5 for evaluation, more for response)
  const recentMessages = await prisma.message.findMany({
    where: { channelId },
    include: {
      user: { select: { username: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const contextLines = recentMessages
    .reverse()
    .map((msg) => {
      const sender = msg.user?.username || msg.agent?.name || "System";
      return `[${sender}]: ${msg.content}`;
    })
    .join("\n");

  const agentNames = channelAgents.map((ca) => ca.agent.name).join(", ");

  // Evaluate each agent sequentially with a small random delay
  for (const ca of autoRespondAgents) {
    const agent = ca.agent;

    try {
      // Build the evaluation prompt
      const evaluationSystemPrompt =
        `You are "${agent.name}" (role: ${agent.role}).` +
        `\nYour expertise: ${agent.description}` +
        `\n\nYou are in a team chat channel. Other agents in this channel: ${agentNames}.` +
        `\n\nA team member just said:\n"${content}"` +
        `\n\nRecent conversation context:\n${contextLines}` +
        `\n\nBased on your role and expertise, should you respond to this message?` +
        `\nRules:` +
        `\n- Respond ONLY if the message is directly relevant to your expertise` +
        `\n- Do NOT respond to casual greetings like "hi", "hello", "hey" unless specifically asking for your help` +
        `\n- Do NOT respond to off-topic messages or things other agents are better suited for` +
        `\n- Do NOT respond if another agent with more relevant expertise is also in the channel and the topic is clearly theirs` +
        `\n- If the message is a general question that any team member could answer, only respond if your specific expertise adds value` +
        `\n- If in doubt, stay silent` +
        `\n\nReply with exactly "YES" or "NO" on the first line.` +
        `\nIf YES, include your full response after a blank line.`;

      const evaluationMessages: { role: "user" | "assistant"; content: string }[] = [
        { role: "user", content: "Should you respond to this message? Answer YES or NO." },
      ];

      const evalResult = await callAINonStreaming(
        agent.provider || "anthropic",
        agent.model || "claude-sonnet-4-6",
        evaluationSystemPrompt,
        evaluationMessages
      );

      const lines = evalResult.split("\n");
      const decision = lines[0]?.trim().toUpperCase();

      if (decision !== "YES") {
        // Agent decided not to respond; continue to next agent
        continue;
      }

      // Add a small random delay (0-2 seconds) to stagger agent responses
      await sleep(Math.random() * 2000);

      // Now generate a full streamed response for better UX
      io.to(channelId).emit("agent:typing", { agentId: agent.id, channelId });

      const fullContext = await buildContext(channelId, agent.id);
      const memories = await getAgentMemories(agent.id, channelId);

      const responseSystemPrompt =
        agent.systemPrompt +
        memories +
        `\n\nYou are "${agent.name}" (role: ${agent.role}) in a team chat channel. ` +
        `Respond naturally as a team member. Keep responses concise and actionable. ` +
        `If the task needs another agent's expertise, @mention them to collaborate (e.g. @DesignBot help review this). ` +
        `But never @mention an agent who already responded in this conversation. Only @mention one agent at a time. ` +
        `Available agents: ${agentNames}. ` +
        `To include interactive UI components, use a \`\`\`ui code block with JSON.`;

      const formattedMessages = ensureAlternating(fullContext);

      const aiMessages =
        formattedMessages.length > 0
          ? formattedMessages
          : [{ role: "user" as const, content }];

      // Use tool-aware runAgentTurn (falls back to simple streaming if no tools)
      const { messageId, fullContent } = await runAgentTurn(
        agent,
        channelId,
        responseSystemPrompt,
        aiMessages,
        io
      );

      // Parse UI components
      const { cleanContent, uiComponent } = parseUIComponents(fullContent);

      // Save message to database
      const savedMessage = await prisma.message.create({
        data: {
          id: messageId,
          content: cleanContent,
          type: "agent",
          agentId: agent.id,
          channelId,
          uiComponent: uiComponent ? JSON.stringify(uiComponent) : null,
        },
        include: {
          agent: { select: { id: true, name: true, role: true, avatar: true } },
        },
      });

      // Emit full message
      io.to(channelId).emit("message:new", {
        id: savedMessage.id,
        content: savedMessage.content,
        type: savedMessage.type as "agent",
        agentId: savedMessage.agentId,
        channelId: savedMessage.channelId,
        uiComponent,
        createdAt: savedMessage.createdAt.toISOString(),
        updatedAt: savedMessage.updatedAt.toISOString(),
        agent: savedMessage.agent
          ? {
              id: savedMessage.agent.id,
              name: savedMessage.agent.name,
              role: savedMessage.agent.role as any,
              avatar: savedMessage.agent.avatar,
            }
          : undefined,
      });

      // Update memories asynchronously (fire-and-forget)
      updateMemories(
        agent.id,
        channelId,
        agent.provider || "anthropic",
        agent.model || "claude-sonnet-4-6",
        `User said: ${content}\nAgent responded: ${cleanContent.slice(0, 500)}`
      ).catch((err) => console.error(`Memory update failed for ${agent.name}:`, err));

      // Check for agent-to-agent mentions in the response.
      // Start a new chain with this agent already in the respondedAgents set.
      const respondedAgents = new Set<string>([agent.id]);
      await processMessage(cleanContent, channelId, io, 1, respondedAgents);
    } catch (err) {
      console.error(`Agent ${agent.name} autonomous evaluation error:`, err);
      // Don't emit error to client for autonomous evaluation failures - just log and continue
    }
  }
}

/**
 * Process a message for @mentions and trigger agent responses.
 *
 * @param content        The message text to scan for @mentions
 * @param channelId      Channel where the message was posted
 * @param io             Socket.IO server for real-time events
 * @param turnCount      Global turn counter for the entire conversation chain (not per-agent)
 * @param respondedAgents Set of agent IDs that have already responded in this chain.
 *                        Prevents circular A->B->A loops.
 * @param isHumanTriggered Whether this call originates from a human message (bypasses cooldown)
 */
export async function processMessage(
  content: string,
  channelId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  turnCount = 0,
  respondedAgents: Set<string> = new Set(),
  isHumanTriggered = false
): Promise<void> {
  if (turnCount >= MAX_AGENT_TURNS) {
    console.log(`Max agent turns (${MAX_AGENT_TURNS}) reached, stopping chain`);
    return;
  }

  const mentions = parseMentions(content);
  if (mentions.length === 0) return;

  // Find agents in this channel matching mentions
  const channelAgents = await prisma.channelAgent.findMany({
    where: { channelId },
    include: { agent: true },
  });

  for (const mention of mentions) {
    const agentEntry = channelAgents.find(
      (ca) => ca.agent.name.toLowerCase() === mention || ca.agent.name.toLowerCase().replace(/\s+/g, "") === mention
    );

    if (!agentEntry || !agentEntry.agent.isActive) continue;

    const agent = agentEntry.agent;

    // Prevent circular chains: skip if this agent already responded in this chain
    if (respondedAgents.has(agent.id)) {
      console.log(`Agent "${agent.name}" already responded in this chain, skipping to prevent loop`);
      continue;
    }

    // Enforce cooldown for agent-triggered mentions.
    // Bypass cooldown when: explicitly marked as human-triggered, or turnCount === 0
    // (turnCount 0 is always the initial call from a human message in socket/index.ts)
    const bypassCooldown = isHumanTriggered || turnCount === 0;
    if (!bypassCooldown && isAgentInCooldown(agent.id, channelId)) {
      console.log(`Agent "${agent.name}" is in cooldown for channel ${channelId}, skipping`);
      continue;
    }

    try {
      // Emit typing indicator
      io.to(channelId).emit("agent:typing", { agentId: agent.id, channelId });

      // Build context
      const context = await buildContext(channelId, agent.id);
      const memories = await getAgentMemories(agent.id, channelId);

      const systemPrompt =
        agent.systemPrompt +
        memories +
        `\n\nYou are "${agent.name}" (role: ${agent.role}) in a team chat channel. ` +
        `Respond naturally as a team member. Keep responses concise and actionable. ` +
        `If the task needs another agent's expertise, @mention them to collaborate (e.g. @DesignBot help review this). ` +
        `But never @mention an agent who already responded in this conversation. Only @mention one agent at a time. ` +
        `Available agents: ${channelAgents.map((ca) => ca.agent.name).join(", ")}. ` +
        `To include interactive UI components, use a \`\`\`ui code block with JSON.`;

      // Ensure alternating user/assistant messages
      const formattedMessages = ensureAlternating(context);

      const aiMessages = formattedMessages.length > 0 ? formattedMessages : [{ role: "user" as const, content }];

      // Use tool-aware runAgentTurn (falls back to simple streaming if no tools)
      const { messageId, fullContent } = await runAgentTurn(
        agent,
        channelId,
        systemPrompt,
        aiMessages,
        io
      );

      // Parse UI components from response
      const { cleanContent, uiComponent } = parseUIComponents(fullContent);

      // Save message to database
      const savedMessage = await prisma.message.create({
        data: {
          id: messageId,
          content: cleanContent,
          type: "agent",
          agentId: agent.id,
          channelId,
          uiComponent: uiComponent ? JSON.stringify(uiComponent) : null,
        },
        include: {
          agent: { select: { id: true, name: true, role: true, avatar: true } },
        },
      });

      // Emit full message
      io.to(channelId).emit("message:new", {
        id: savedMessage.id,
        content: savedMessage.content,
        type: savedMessage.type as "agent",
        agentId: savedMessage.agentId,
        channelId: savedMessage.channelId,
        uiComponent,
        createdAt: savedMessage.createdAt.toISOString(),
        updatedAt: savedMessage.updatedAt.toISOString(),
        agent: savedMessage.agent
          ? {
              id: savedMessage.agent.id,
              name: savedMessage.agent.name,
              role: savedMessage.agent.role as any,
              avatar: savedMessage.agent.avatar,
            }
          : undefined,
      });

      // Update memories asynchronously using AI extraction (fire-and-forget)
      updateMemories(
        agent.id,
        channelId,
        agent.provider || "anthropic",
        agent.model || "claude-sonnet-4-6",
        `User said: ${content}\nAgent responded: ${cleanContent.slice(0, 500)}`
      ).catch((err) => console.error(`Memory update failed for ${agent.name}:`, err));

      // Record cooldown and track this agent in the chain
      if (!isHumanTriggered) {
        setAgentCooldown(agent.id, channelId);
      }
      const updatedRespondedAgents = new Set(respondedAgents);
      updatedRespondedAgents.add(agent.id);

      // Check for agent-to-agent mentions in the response (never human-triggered)
      await processMessage(cleanContent, channelId, io, turnCount + 1, updatedRespondedAgents, false);
    } catch (err) {
      console.error(`Agent ${agent.name} error:`, err);
      io.to(channelId).emit("agent:error", {
        agentId: agent.id,
        channelId,
        error: `Agent ${agent.name} failed to respond: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }
}

/**
 * Ensure messages alternate between user and assistant roles.
 * Claude API requires alternating roles.
 */
function ensureAlternating(
  messages: { role: "user" | "assistant"; content: string }[]
): { role: "user" | "assistant"; content: string }[] {
  if (messages.length === 0) return [];

  const result: { role: "user" | "assistant"; content: string }[] = [];
  let lastRole: "user" | "assistant" | null = null;

  for (const msg of messages) {
    if (msg.role === lastRole) {
      // Merge with previous message
      result[result.length - 1].content += "\n" + msg.content;
    } else {
      result.push({ ...msg });
      lastRole = msg.role;
    }
  }

  // Ensure first message is from user
  if (result.length > 0 && result[0].role === "assistant") {
    result.unshift({ role: "user", content: "[conversation start]" });
  }

  return result;
}

/**
 * Handle UI action from client.
 */
export async function processUIAction(
  messageId: string,
  actionId: string,
  payload: Record<string, unknown> | undefined,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { agent: true },
  });

  if (!message || !message.agentId || !message.uiComponent) return;

  const uiComponent = JSON.parse(message.uiComponent);
  const action = uiComponent.actions?.find((a: any) => a.id === actionId);

  if (!action) return;

  // Sanitize payload to prevent prompt injection
  const sanitizedPayload = payload
    ? JSON.stringify(payload).slice(0, 1000).replace(/[<>]/g, "")
    : "";

  // Create a user message describing the action
  const actionDescription = `[UI Action] User clicked "${action.label}" on component "${uiComponent.type}". ${
    sanitizedPayload ? `Data: ${sanitizedPayload}` : ""
  }`;

  const actionMsg = await prisma.message.create({
    data: {
      content: actionDescription,
      type: "system",
      channelId: message.channelId,
    },
  });

  io.to(message.channelId).emit("message:new", {
    id: actionMsg.id,
    content: actionMsg.content,
    type: "system",
    channelId: actionMsg.channelId,
    createdAt: actionMsg.createdAt.toISOString(),
    updatedAt: actionMsg.updatedAt.toISOString(),
  });

  // Trigger agent to respond to the action.
  // This is a human-initiated action (UI click), so it's treated as human-triggered
  // and starts at turn 1 to leave room for follow-up agent-to-agent turns.
  await processMessage(
    `@${message.agent!.name} The user responded to your "${uiComponent.type}" component: ${action.label}. ${
      sanitizedPayload ? `Submitted data: ${sanitizedPayload}` : ""
    }`,
    message.channelId,
    io,
    1,
    new Set(),
    true
  );
}
