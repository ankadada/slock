import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { withFileLock } from "../lib/file-lock.js";
import { getProviderConfig } from "../routes/settings.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@slock/shared";

// ============================================================
// Task Model
// ============================================================

export interface AgentTask {
  id: string;
  channelId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status: "pending" | "assigned" | "in_progress" | "completed" | "failed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  managerAgentId: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// File-based persistence
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TASKS_FILE = path.join(__dirname, "../../data/tasks.json");

function loadTasks(): AgentTask[] {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
    }
  } catch {
    // ignore corrupted file
  }
  return [];
}

function saveTasks(tasks: AgentTask[]): void {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// ============================================================
// Task CRUD
// ============================================================

export function getChannelTasks(channelId: string): AgentTask[] {
  const all = loadTasks();
  return all.filter((t) => t.channelId === channelId);
}

export function getTask(taskId: string): AgentTask | undefined {
  const all = loadTasks();
  return all.find((t) => t.id === taskId);
}

export async function createTask(task: Omit<AgentTask, "id" | "createdAt" | "updatedAt">): Promise<AgentTask> {
  return withFileLock("tasks", async () => {
    const now = new Date().toISOString();
    const newTask: AgentTask = {
      ...task,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };
    const all = loadTasks();
    all.push(newTask);
    saveTasks(all);
    return newTask;
  });
}

export async function updateTaskStatus(
  taskId: string,
  status: AgentTask["status"],
  result?: string
): Promise<AgentTask | undefined> {
  return withFileLock("tasks", async () => {
    const all = loadTasks();
    const idx = all.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    all[idx].status = status;
    all[idx].updatedAt = new Date().toISOString();
    if (result !== undefined) {
      all[idx].result = result;
    }
    saveTasks(all);
    return all[idx];
  });
}

// ============================================================
// AI helpers (non-streaming, for manager decisions)
// ============================================================

async function callAINonStreaming(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
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
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [{ role: "user", content: "Hello" }],
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
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });
    return response.choices[0]?.message?.content || "";
  }
}

/**
 * Stream a response from AI, emitting chunks via socket.
 * Returns the full accumulated content.
 */
async function streamAIToChat(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  agentId: string,
  channelId: string,
  messageId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<string> {
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(`API key for provider "${provider}" not configured.`);
  }

  let fullContent = "";

  if (provider === "anthropic") {
    const client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [{ role: "user", content: "Hello" }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullContent += event.delta.text;
        io.to(channelId).emit("agent:stream", {
          agentId,
          channelId,
          messageId,
          chunk: event.delta.text,
          done: false,
        });
      }
    }
  } else {
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const stream = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        io.to(channelId).emit("agent:stream", {
          agentId,
          channelId,
          messageId,
          chunk: delta,
          done: false,
        });
      }
    }
  }

  io.to(channelId).emit("agent:stream", {
    agentId,
    channelId,
    messageId,
    chunk: "",
    done: true,
  });

  return fullContent;
}

// ============================================================
// Core Manager Functions
// ============================================================

interface ManagerAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  systemPrompt: string;
}

interface WorkerAgent {
  id: string;
  name: string;
  role: string;
  description: string;
}

/**
 * Decompose a user request into sub-tasks using AI.
 * The manager agent analyzes the request, breaks it into sub-tasks,
 * and assigns each to the most appropriate worker agent.
 */
export async function decomposeTask(
  managerAgent: ManagerAgent,
  userMessage: string,
  availableAgents: WorkerAgent[],
  channelId: string
): Promise<AgentTask[]> {
  const agentList = availableAgents
    .map((a) => `- ${a.name} (role: ${a.role}): ${a.description}`)
    .join("\n");

  const systemPrompt =
    `You are a project manager AI. Your job is to decompose complex tasks into sub-tasks and assign them to the most appropriate team members.\n\n` +
    `Available team members:\n${agentList}\n\n` +
    `Instructions:\n` +
    `1. Break the user's request into 2-6 concrete, actionable sub-tasks\n` +
    `2. Assign each sub-task to the most appropriate team member based on their role and description\n` +
    `3. Order tasks logically (dependencies first)\n` +
    `4. Each task should be self-contained enough for the assigned agent to execute independently\n\n` +
    `Respond ONLY with a JSON array of tasks. No other text. Example:\n` +
    `[{"title":"Design the UI layout","description":"Create a wireframe for the settings page with sections for profile, notifications, and privacy.","assignedAgentName":"DesignBot"},{"title":"Implement the API endpoints","description":"Create REST endpoints for GET/PUT user settings.","assignedAgentName":"CodeBot"}]\n\n` +
    `IMPORTANT: assignedAgentName must exactly match one of the team member names listed above. If no agent fits, use the first available agent.`;

  const result = await callAINonStreaming(
    managerAgent.provider || "anthropic",
    managerAgent.model || "claude-sonnet-4-6",
    systemPrompt,
    [{ role: "user", content: userMessage }]
  );

  // Parse the JSON response
  let parsed: { title: string; description: string; assignedAgentName: string }[];
  try {
    // Extract JSON array from the response (handle markdown code blocks)
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("Failed to parse task decomposition:", result);
    // Fallback: create a single task
    parsed = [
      {
        title: "Execute request",
        description: userMessage,
        assignedAgentName: availableAgents[0]?.name || "Unknown",
      },
    ];
  }

  const now = new Date().toISOString();
  const parentTaskId = uuid();

  // Create the parent task
  const parentTask: AgentTask = {
    id: parentTaskId,
    channelId,
    title: `Manager Task: ${userMessage.slice(0, 80)}${userMessage.length > 80 ? "..." : ""}`,
    description: userMessage,
    status: "in_progress",
    managerAgentId: managerAgent.id,
    createdAt: now,
    updatedAt: now,
  };

  // Create sub-tasks
  const subTasks: AgentTask[] = parsed.map((item) => {
    const matchedAgent = availableAgents.find(
      (a) => a.name.toLowerCase() === item.assignedAgentName.toLowerCase()
    ) || availableAgents[0];

    return {
      id: uuid(),
      channelId,
      parentTaskId,
      title: item.title,
      description: item.description,
      status: "pending" as const,
      assignedAgentId: matchedAgent?.id,
      assignedAgentName: matchedAgent?.name || item.assignedAgentName,
      managerAgentId: managerAgent.id,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Persist all tasks
  await withFileLock("tasks", async () => {
    const all = loadTasks();
    all.push(parentTask, ...subTasks);
    saveTasks(all);
  });

  return [parentTask, ...subTasks];
}

/**
 * Execute a single task by sending it to the assigned agent.
 * The assigned agent receives the task description and produces a response.
 */
export async function executeTask(
  task: AgentTask,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<string> {
  if (!task.assignedAgentId) {
    throw new Error(`Task "${task.title}" has no assigned agent`);
  }

  // Fetch the agent from DB
  const agent = await prisma.agentConfig.findUnique({
    where: { id: task.assignedAgentId },
  });

  if (!agent) {
    throw new Error(`Agent ${task.assignedAgentId} not found`);
  }

  // Emit typing indicator
  io.to(task.channelId).emit("agent:typing", {
    agentId: agent.id,
    channelId: task.channelId,
  });

  // Build context from recent messages
  const recentMessages = await prisma.message.findMany({
    where: { channelId: task.channelId },
    include: {
      user: { select: { username: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const contextLines = recentMessages
    .reverse()
    .map((msg) => {
      const sender = msg.user?.username || msg.agent?.name || "System";
      return `[${sender}]: ${msg.content}`;
    })
    .join("\n");

  const systemPrompt =
    agent.systemPrompt +
    `\n\nYou have been assigned a specific task by your project manager. Focus on completing this task thoroughly.\n` +
    `\nTask: ${task.title}\nDetails: ${task.description}\n\n` +
    `Recent conversation context:\n${contextLines}\n\n` +
    `Provide a clear, actionable response that addresses the task. Be thorough but concise.`;

  const messageId = uuid();

  // Stream the agent's response
  const fullContent = await streamAIToChat(
    agent.provider || "anthropic",
    agent.model || "claude-sonnet-4-6",
    systemPrompt,
    [{ role: "user", content: `Please complete this task: ${task.title}\n\n${task.description}` }],
    agent.id,
    task.channelId,
    messageId,
    io
  );

  // Save the agent's message to DB
  const savedMessage = await prisma.message.create({
    data: {
      id: messageId,
      content: fullContent,
      type: "agent",
      agentId: agent.id,
      channelId: task.channelId,
    },
    include: {
      agent: { select: { id: true, name: true, role: true, avatar: true } },
    },
  });

  // Broadcast the message
  io.to(task.channelId).emit("message:new", {
    id: savedMessage.id,
    content: savedMessage.content,
    type: savedMessage.type as "agent",
    agentId: savedMessage.agentId || undefined,
    channelId: savedMessage.channelId,
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

  return fullContent;
}

/**
 * Post a task-board UI component to the chat as a message from the manager agent.
 */
async function postTaskBoard(
  managerAgent: ManagerAgent,
  tasks: AgentTask[],
  channelId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  title: string
): Promise<void> {
  const parentTask = tasks.find((t) => !t.parentTaskId);
  const subTasks = tasks.filter((t) => t.parentTaskId);

  const taskSummary = subTasks
    .map((t, i) => {
      const statusEmoji: Record<string, string> = {
        pending: "[ ]",
        assigned: "[>]",
        in_progress: "[~]",
        completed: "[x]",
        failed: "[!]",
      };
      return `${statusEmoji[t.status] || "[ ]"} **${t.title}** -> @${t.assignedAgentName || "unassigned"}`;
    })
    .join("\n");

  const content =
    `**${title}**\n\n` +
    `I've broken this down into ${subTasks.length} sub-tasks:\n\n` +
    `${taskSummary}\n\n` +
    `I'll now coordinate each agent to complete their task.`;

  const messageId = uuid();

  // Build the task board UI component
  const uiComponent = {
    id: uuid(),
    type: "task_board" as const,
    props: {
      parentTaskId: parentTask?.id,
      tasks: subTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignedAgentName: t.assignedAgentName,
        assignedAgentId: t.assignedAgentId,
      })),
    },
  };

  // Save manager message
  const savedMessage = await prisma.message.create({
    data: {
      id: messageId,
      content,
      type: "agent",
      agentId: managerAgent.id,
      channelId,
      uiComponent: JSON.stringify(uiComponent),
    },
    include: {
      agent: { select: { id: true, name: true, role: true, avatar: true } },
    },
  });

  io.to(channelId).emit("message:new", {
    id: savedMessage.id,
    content: savedMessage.content,
    type: savedMessage.type as "agent",
    agentId: savedMessage.agentId || undefined,
    channelId: savedMessage.channelId,
    uiComponent: uiComponent as any,
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
  } as any);
}

/**
 * Post a final summary message from the manager agent.
 */
async function postSummary(
  managerAgent: ManagerAgent,
  tasks: AgentTask[],
  channelId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const subTasks = tasks.filter((t) => t.parentTaskId);
  const completed = subTasks.filter((t) => t.status === "completed");
  const failed = subTasks.filter((t) => t.status === "failed");

  // Use AI to generate a coherent summary
  const taskResults = subTasks
    .map((t) => `Task: ${t.title}\nAssigned to: ${t.assignedAgentName}\nStatus: ${t.status}\nResult: ${t.result?.slice(0, 500) || "N/A"}`)
    .join("\n\n---\n\n");

  const systemPrompt =
    managerAgent.systemPrompt +
    `\n\nYou are compiling a summary of completed sub-tasks. Synthesize the results into a clear, actionable summary for the team.\n` +
    `Be concise. Highlight key outcomes, decisions, and any remaining items.`;

  const summaryContent = await callAINonStreaming(
    managerAgent.provider || "anthropic",
    managerAgent.model || "claude-sonnet-4-6",
    systemPrompt,
    [
      {
        role: "user",
        content:
          `Here are the results from the sub-tasks:\n\n${taskResults}\n\n` +
          `${completed.length}/${subTasks.length} tasks completed, ${failed.length} failed.\n` +
          `Please provide a concise summary of what was accomplished.`,
      },
    ]
  );

  const messageId = uuid();

  const savedMessage = await prisma.message.create({
    data: {
      id: messageId,
      content: `**Task Summary** (${completed.length}/${subTasks.length} completed)\n\n${summaryContent}`,
      type: "agent",
      agentId: managerAgent.id,
      channelId,
    },
    include: {
      agent: { select: { id: true, name: true, role: true, avatar: true } },
    },
  });

  io.to(channelId).emit("message:new", {
    id: savedMessage.id,
    content: savedMessage.content,
    type: savedMessage.type as "agent",
    agentId: savedMessage.agentId || undefined,
    channelId: savedMessage.channelId,
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
}

/**
 * Emit a task:update event so the frontend can update its task store in real-time.
 */
function emitTaskUpdate(
  task: AgentTask,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  // Use a generic emit since task:update is a custom event
  // The frontend listens for this via the socket
  (io.to(task.channelId) as any).emit("task:update", task);
}

/**
 * Run the full manager delegation pipeline.
 *
 * 1. Decompose the user request into sub-tasks
 * 2. Post a task board to chat
 * 3. Execute each task sequentially
 * 4. Update task status in real-time
 * 5. Compile and post a final summary
 */
export async function runManagerPipeline(
  managerAgentId: string,
  channelId: string,
  userMessage: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  // Fetch the manager agent
  const managerAgentRecord = await prisma.agentConfig.findUnique({
    where: { id: managerAgentId },
  });

  if (!managerAgentRecord) {
    throw new Error(`Manager agent ${managerAgentId} not found`);
  }

  const managerAgent: ManagerAgent = {
    id: managerAgentRecord.id,
    name: managerAgentRecord.name,
    provider: managerAgentRecord.provider || "anthropic",
    model: managerAgentRecord.model || "claude-sonnet-4-6",
    systemPrompt: managerAgentRecord.systemPrompt,
  };

  // Emit typing indicator for the manager
  io.to(channelId).emit("agent:typing", {
    agentId: managerAgent.id,
    channelId,
  });

  // Get all worker agents in this channel (excluding the manager itself)
  const channelAgents = await prisma.channelAgent.findMany({
    where: { channelId },
    include: { agent: true },
  });

  const availableAgents: WorkerAgent[] = channelAgents
    .filter((ca) => ca.agent.id !== managerAgentId && ca.agent.isActive)
    .map((ca) => ({
      id: ca.agent.id,
      name: ca.agent.name,
      role: ca.agent.role,
      description: ca.agent.description || ca.agent.role,
    }));

  if (availableAgents.length === 0) {
    // No worker agents, manager responds directly
    const messageId = uuid();
    const content = await streamAIToChat(
      managerAgent.provider,
      managerAgent.model,
      managerAgent.systemPrompt +
        "\n\nNo worker agents are available in this channel. Respond to the user's request directly as best you can, and suggest adding team member agents to the channel for better task delegation.",
      [{ role: "user", content: userMessage }],
      managerAgent.id,
      channelId,
      messageId,
      io
    );

    const savedMessage = await prisma.message.create({
      data: {
        id: messageId,
        content,
        type: "agent",
        agentId: managerAgent.id,
        channelId,
      },
      include: {
        agent: { select: { id: true, name: true, role: true, avatar: true } },
      },
    });

    io.to(channelId).emit("message:new", {
      id: savedMessage.id,
      content: savedMessage.content,
      type: savedMessage.type as "agent",
      agentId: savedMessage.agentId || undefined,
      channelId: savedMessage.channelId,
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
    return;
  }

  // Step 1: Decompose the task
  const tasks = await decomposeTask(managerAgent, userMessage, availableAgents, channelId);
  const parentTask = tasks.find((t) => !t.parentTaskId)!;
  const subTasks = tasks.filter((t) => t.parentTaskId);

  // Step 2: Post task board to chat
  await postTaskBoard(managerAgent, tasks, channelId, io, `Task Plan: ${userMessage.slice(0, 60)}`);

  // Step 3: Execute each sub-task sequentially
  for (const task of subTasks) {
    try {
      // Update status to in_progress
      await updateTaskStatus(task.id, "in_progress");
      task.status = "in_progress";
      emitTaskUpdate(task, io);

      // Execute the task
      const result = await executeTask(task, io);

      // Mark completed
      const updated = await updateTaskStatus(task.id, "completed", result.slice(0, 2000));
      if (updated) {
        Object.assign(task, updated);
      }
      emitTaskUpdate(task, io);
    } catch (err) {
      console.error(`Task "${task.title}" execution failed:`, err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const updated = await updateTaskStatus(task.id, "failed", errorMsg);
      if (updated) {
        Object.assign(task, updated);
      }
      emitTaskUpdate(task, io);
    }
  }

  // Step 4: Update parent task status
  const allCompleted = subTasks.every((t) => t.status === "completed");
  const anyFailed = subTasks.some((t) => t.status === "failed");
  const parentStatus: AgentTask["status"] = allCompleted ? "completed" : anyFailed ? "failed" : "completed";
  await updateTaskStatus(parentTask.id, parentStatus);
  parentTask.status = parentStatus;
  emitTaskUpdate(parentTask, io);

  // Step 5: Post summary
  // Reload tasks to get latest results
  const finalTasks = loadTasks().filter(
    (t) => t.id === parentTask.id || t.parentTaskId === parentTask.id
  );
  await postSummary(managerAgent, finalTasks, channelId, io);
}
