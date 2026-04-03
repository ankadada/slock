import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { prisma } from "../lib/prisma.js";
import { getProviderConfig } from "../routes/settings.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@slock/shared";

// Track workflows waiting for approval
const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();

/**
 * Start executing a workflow.
 */
export async function startWorkflow(
  workflowId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        include: { agent: true },
        orderBy: { stepOrder: "asc" },
      },
    },
  });

  if (!workflow) throw new Error("Workflow not found");

  const startIndex = workflow.currentStepIndex || 0;

  await prisma.workflow.update({
    where: { id: workflowId },
    data: { status: "running", currentStepIndex: startIndex },
  });

  emitWorkflowUpdate(workflowId, io);

  let previousResult = "";

  // Resume from currentStepIndex (supports restart after approval)
  for (let i = startIndex; i < workflow.steps.length; i++) {
    // Re-check status in case it was paused
    const current = await prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!current || current.status === "paused" || current.status === "failed") break;

    const step = workflow.steps[i];

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { currentStepIndex: i },
    });

    await prisma.workflowStep.update({
      where: { id: step.id },
      data: { status: "running" },
    });

    emitWorkflowUpdate(workflowId, io);

    try {
      // Build prompt with context from previous steps
      const prompt = previousResult
        ? `${step.prompt}\n\nContext from previous step: ${previousResult}`
        : step.prompt;

      // Call agent
      const response = await callAgent(step.agent, prompt, workflow.channelId, io);

      // Save result
      await prisma.workflowStep.update({
        where: { id: step.id },
        data: { status: "completed", result: response },
      });

      previousResult = response;

      io.to(workflow.channelId).emit("workflow:step_complete", {
        workflowId,
        stepIndex: i,
        result: response,
      });

      // Check if approval is needed before next step
      if (step.waitForApproval && i < workflow.steps.length - 1) {
        await prisma.workflow.update({
          where: { id: workflowId },
          data: { status: "paused" },
        });

        emitWorkflowUpdate(workflowId, io);

        // Wait for approval
        const approved = await waitForApproval(workflowId, i);
        if (!approved) {
          await prisma.workflowStep.update({
            where: { id: workflow.steps[i + 1].id },
            data: { status: "skipped" },
          });
          continue;
        }

        await prisma.workflow.update({
          where: { id: workflowId },
          data: { status: "running" },
        });
      }
    } catch (err) {
      console.error(`Workflow step ${i} error:`, err);
      await prisma.workflowStep.update({
        where: { id: step.id },
        data: { status: "failed", result: err instanceof Error ? err.message : "Unknown error" },
      });
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { status: "failed" },
      });
      emitWorkflowUpdate(workflowId, io);
      return;
    }
  }

  // All steps completed
  const finalStatus = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (finalStatus && finalStatus.status === "running") {
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: "completed" },
    });
  }
  emitWorkflowUpdate(workflowId, io);
}

/**
 * Call an agent with a prompt and stream the response.
 */
async function callAgent(
  agent: any,
  prompt: string,
  channelId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<string> {
  io.to(channelId).emit("agent:typing", { agentId: agent.id, channelId });

  const messageId = uuid();
  let fullContent = "";

  const provider = agent.provider || "anthropic";
  const model = agent.model || "claude-sonnet-4-6";
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(`API key for "${provider}" not configured`);
  }

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: config.apiKey, ...(config.baseUrl ? { baseURL: config.baseUrl } : {}) });
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullContent += event.delta.text;
        io.to(channelId).emit("agent:stream", { agentId: agent.id, channelId, messageId, chunk: event.delta.text, done: false });
      }
    }
  } else {
    const client = new OpenAI({ apiKey: config.apiKey, ...(config.baseUrl ? { baseURL: config.baseUrl } : {}) });
    const stream = await client.chat.completions.create({
      model, max_tokens: 4096, stream: true,
      messages: [{ role: "system", content: agent.systemPrompt }, { role: "user", content: prompt }],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        io.to(channelId).emit("agent:stream", { agentId: agent.id, channelId, messageId, chunk: delta, done: false });
      }
    }
  }

  // Save as message
  const savedMessage = await prisma.message.create({
    data: {
      id: messageId,
      content: fullContent,
      type: "agent",
      agentId: agent.id,
      channelId,
    },
    include: {
      agent: { select: { id: true, name: true, role: true, avatar: true } },
    },
  });

  io.to(channelId).emit("agent:stream", {
    agentId: agent.id,
    channelId,
    messageId,
    chunk: "",
    done: true,
  });

  io.to(channelId).emit("message:new", {
    id: savedMessage.id,
    content: savedMessage.content,
    type: "agent" as const,
    agentId: savedMessage.agentId,
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
 * Wait for user to approve a workflow step.
 */
function waitForApproval(workflowId: string, stepIndex: number): Promise<boolean> {
  return new Promise((resolve) => {
    const key = `${workflowId}:${stepIndex}`;
    pendingApprovals.set(key, { resolve });

    // Auto-timeout after 30 minutes
    setTimeout(() => {
      if (pendingApprovals.has(key)) {
        pendingApprovals.delete(key);
        resolve(false);
      }
    }, 30 * 60 * 1000);
  });
}

/**
 * Approve or reject a workflow step.
 */
export async function approveStep(
  workflowId: string,
  stepIndex: number,
  approved: boolean,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const key = `${workflowId}:${stepIndex}`;
  const pending = pendingApprovals.get(key);

  if (pending) {
    pendingApprovals.delete(key);
    pending.resolve(approved);
  } else {
    // If no pending approval, restart workflow from the next step
    if (approved) {
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { status: "running", currentStepIndex: stepIndex + 1 },
      });
      await startWorkflow(workflowId, io);
    }
  }
}

/**
 * Emit workflow update to channel.
 */
async function emitWorkflowUpdate(
  workflowId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        include: { agent: { select: { id: true, name: true, role: true } } },
        orderBy: { stepOrder: "asc" },
      },
    },
  });

  if (!workflow) return;

  io.to(workflow.channelId).emit("workflow:update", {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    channelId: workflow.channelId,
    status: workflow.status as any,
    currentStepIndex: workflow.currentStepIndex,
    createdAt: workflow.createdAt.toISOString(),
    steps: workflow.steps.map((s) => ({
      id: s.id,
      agentId: s.agentId,
      action: s.action,
      prompt: s.prompt,
      waitForApproval: s.waitForApproval,
      maxTurns: s.maxTurns,
      status: s.status as any,
      result: s.result || undefined,
    })),
  });
}
