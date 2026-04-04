import { prisma } from "../lib/prisma.js";
import { getProviderConfig } from "../routes/settings.js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const MAX_LONG_TERM_MEMORIES = 100;
const SESSION_EXPIRY_HOURS = 24;

/**
 * Make a non-streaming AI call for memory operations.
 */
async function callAI(
  provider: string,
  model: string,
  systemPrompt: string,
  userMessage: string
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
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } else {
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const response = await client.chat.completions.create({
      model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }
}

/**
 * Store a memory in the appropriate layer.
 */
export async function storeMemory(
  agentId: string,
  channelId: string,
  layer: string,
  key: string,
  content: string,
  importance = 0
): Promise<void> {
  const expiresAt =
    layer === "session"
      ? new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000)
      : null;

  await prisma.agentMemory.upsert({
    where: {
      agentId_channelId_key: { agentId, channelId, key },
    },
    update: { content, layer, importance, expiresAt },
    create: { agentId, channelId, layer, key, content, importance, expiresAt },
  });
}

/**
 * Retrieve memories for an agent in a channel, across all layers.
 * Returns a formatted string suitable for injecting into the system prompt.
 */
export async function getMemoryContext(
  agentId: string,
  channelId: string
): Promise<string> {
  // Clean up expired session memories first
  await prisma.agentMemory.deleteMany({
    where: {
      agentId,
      channelId,
      layer: "session",
      expiresAt: { lt: new Date() },
    },
  });

  // Fetch all layers for this agent
  const memories = await prisma.agentMemory.findMany({
    where: { agentId, channelId },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
  });

  // Fetch shared memories (from all agents in the channel)
  const sharedMemories = await prisma.agentMemory.findMany({
    where: {
      channelId,
      layer: "shared",
      agentId: { not: agentId },
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });

  if (memories.length === 0 && sharedMemories.length === 0) return "";

  const sections: string[] = [];

  // Long-term facts
  const longTerm = memories.filter((m) => m.layer === "long_term");
  if (longTerm.length > 0) {
    sections.push(
      "## Long-term Knowledge\n" +
        longTerm.map((m) => `- ${m.key}: ${m.content}`).join("\n")
    );
  }

  // Daily summaries
  const daily = memories.filter((m) => m.layer === "daily");
  if (daily.length > 0) {
    sections.push(
      "## Daily Summary\n" +
        daily.map((m) => `- ${m.key}: ${m.content}`).join("\n")
    );
  }

  // Session context
  const session = memories.filter((m) => m.layer === "session");
  if (session.length > 0) {
    sections.push(
      "## Session Context\n" +
        session.map((m) => `- ${m.key}: ${m.content}`).join("\n")
    );
  }

  // Shared memories from other agents
  if (sharedMemories.length > 0) {
    sections.push(
      "## Shared Knowledge (from other agents)\n" +
        sharedMemories.map((m) => `- ${m.key}: ${m.content}`).join("\n")
    );
  }

  return "\n\nYour memories from this channel:\n" + sections.join("\n\n");
}

/**
 * Extract and store memories from a conversation using AI.
 * Analyzes recent messages and stores key facts in the long_term layer.
 */
export async function extractAndStoreMemories(
  agentId: string,
  channelId: string,
  provider: string,
  model: string,
  recentMessages: string[]
): Promise<void> {
  if (recentMessages.length === 0) return;

  const conversation = recentMessages.join("\n");

  const systemPrompt =
    `You are a memory extraction assistant. Analyze the following conversation and extract key facts worth remembering long-term.` +
    `\n\nCategories: user_preferences, project_context, decisions, action_items, technical_specs` +
    `\n\nFor each fact, rate its importance from 0-10 (10 = critical project decision, 0 = trivial).` +
    `\n\nExtract 0-5 key facts. For each fact, output one line in the format:` +
    `\nimportance|category|short_key|fact` +
    `\n\nExample:` +
    `\n8|decisions|auth_method|Team decided to use JWT for authentication` +
    `\n5|action_items|api_docs|Need to write API documentation by Friday` +
    `\n3|user_preferences|tone|Team prefers concise, technical responses` +
    `\n\nIf there are no meaningful facts to extract, output "NONE".`;

  try {
    const result = await callAI(
      provider,
      model,
      systemPrompt,
      `Extract key facts from this conversation:\n\n${conversation}`
    );

    const trimmed = result.trim();
    if (trimmed === "NONE" || trimmed.length === 0) return;

    const lines = trimmed.split("\n").filter((l) => l.includes("|"));
    for (const line of lines.slice(0, 5)) {
      const parts = line.split("|");
      if (parts.length < 4) continue;
      const [importanceStr, category, shortKey, ...factParts] = parts;
      const importance = Math.min(10, Math.max(0, parseInt(importanceStr!.trim(), 10) || 0));
      const key = `${category!.trim()}_${shortKey!.trim()}`;
      const content = factParts.join("|").trim();
      if (key && content) {
        await storeMemory(agentId, channelId, "long_term", key, content, importance);
      }
    }

    // Cap long_term entries
    await cleanupMemories(agentId, channelId);
  } catch (err) {
    console.error(`Memory extraction failed for agent ${agentId}:`, err);
  }
}

/**
 * Generate a daily summary of all messages from today in a channel.
 * Stores the summary in the daily layer.
 */
export async function generateDailySummary(
  agentId: string,
  channelId: string,
  provider: string,
  model: string
): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    include: {
      user: { select: { username: true } },
      agent: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  if (messages.length === 0) {
    return "No messages found for today.";
  }

  const conversationText = messages
    .map((msg) => {
      const sender = msg.user?.username || msg.agent?.name || "System";
      return `[${sender}]: ${msg.content}`;
    })
    .join("\n");

  const systemPrompt =
    `You are a summary assistant. Produce a concise daily summary of the key discussions, decisions, and action items from the conversation below.` +
    `\nFormat:` +
    `\n- Key topics discussed` +
    `\n- Decisions made` +
    `\n- Action items` +
    `\n- Notable mentions` +
    `\nKeep it under 300 words.`;

  try {
    const summary = await callAI(
      provider,
      model,
      systemPrompt,
      `Summarize today's conversation:\n\n${conversationText}`
    );

    const dateKey = todayStart.toISOString().split("T")[0]!;
    await storeMemory(agentId, channelId, "daily", dateKey, summary.trim(), 5);

    return summary.trim();
  } catch (err) {
    console.error(`Daily summary generation failed for agent ${agentId}:`, err);
    throw err;
  }
}

/**
 * Store a shared memory (readable by all agents in the channel).
 */
export async function storeSharedMemory(
  channelId: string,
  key: string,
  content: string,
  importance = 5
): Promise<void> {
  // Shared memories use a sentinel agentId
  // We need at least one agent in the channel to associate the memory.
  // Pick the first agent in the channel.
  const channelAgent = await prisma.channelAgent.findFirst({
    where: { channelId },
  });

  if (!channelAgent) {
    throw new Error("No agents in this channel to associate shared memory with.");
  }

  await storeMemory(
    channelAgent.agentId,
    channelId,
    "shared",
    key,
    content,
    importance
  );
}

/**
 * Get shared memories for a channel.
 */
export async function getSharedMemories(channelId: string): Promise<string> {
  const memories = await prisma.agentMemory.findMany({
    where: { channelId, layer: "shared" },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });

  if (memories.length === 0) return "";

  return memories.map((m) => `- ${m.key}: ${m.content}`).join("\n");
}

/**
 * Cleanup: expire old session memories, cap long_term at MAX_LONG_TERM_MEMORIES entries.
 */
export async function cleanupMemories(
  agentId: string,
  channelId: string
): Promise<void> {
  // Delete expired session memories
  await prisma.agentMemory.deleteMany({
    where: {
      agentId,
      channelId,
      layer: "session",
      expiresAt: { lt: new Date() },
    },
  });

  // Cap long_term entries: keep only the newest MAX_LONG_TERM_MEMORIES by importance then date
  const longTermMemories = await prisma.agentMemory.findMany({
    where: { agentId, channelId, layer: "long_term" },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
  });

  if (longTermMemories.length > MAX_LONG_TERM_MEMORIES) {
    const toDelete = longTermMemories.slice(MAX_LONG_TERM_MEMORIES);
    await prisma.agentMemory.deleteMany({
      where: { id: { in: toDelete.map((m) => m.id) } },
    });
  }
}
