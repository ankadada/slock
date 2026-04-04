import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  generateDailySummary,
  getSharedMemories as getSharedMemoriesService,
} from "../services/memory-service.js";

export const memoryRouter = Router();

/**
 * GET /api/memories/:agentId/:channelId
 * Get all memories for an agent in a channel, organized by layer.
 */
memoryRouter.get("/:agentId/:channelId", async (req: Request, res: Response) => {
  try {
    const { agentId, channelId } = req.params;

    // Clean up expired session memories
    await prisma.agentMemory.deleteMany({
      where: {
        agentId,
        channelId,
        layer: "session",
        expiresAt: { lt: new Date() },
      },
    });

    const memories = await prisma.agentMemory.findMany({
      where: { agentId, channelId },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    });

    const result = memories.map((m) => ({
      id: m.id,
      agentId: m.agentId,
      channelId: m.channelId,
      layer: m.layer,
      key: m.key,
      content: m.content,
      importance: m.importance,
      expiresAt: m.expiresAt?.toISOString() ?? undefined,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    res.json({ data: result });
  } catch (err) {
    console.error("Get agent memories error:", err);
    res.status(500).json({ error: "Failed to get agent memories" });
  }
});

/**
 * GET /api/memories/shared/:channelId
 * Get shared memories for a channel.
 */
memoryRouter.get("/shared/:channelId", async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    const memories = await prisma.agentMemory.findMany({
      where: { channelId, layer: "shared" },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    });

    const result = memories.map((m) => ({
      id: m.id,
      agentId: m.agentId,
      channelId: m.channelId,
      layer: m.layer,
      key: m.key,
      content: m.content,
      importance: m.importance,
      expiresAt: m.expiresAt?.toISOString() ?? undefined,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    res.json({ data: result });
  } catch (err) {
    console.error("Get shared memories error:", err);
    res.status(500).json({ error: "Failed to get shared memories" });
  }
});

/**
 * DELETE /api/memories/:id
 * Delete a specific memory entry.
 */
memoryRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.agentMemory.delete({
      where: { id },
    });

    res.json({ message: "Memory deleted" });
  } catch (err) {
    console.error("Delete memory error:", err);
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

/**
 * POST /api/memories/:agentId/:channelId/summarize
 * Trigger daily summary generation for an agent in a channel.
 */
memoryRouter.post("/:agentId/:channelId/summarize", async (req: Request, res: Response) => {
  try {
    const { agentId, channelId } = req.params;

    // Get the agent's provider and model
    const agent = await prisma.agentConfig.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const summary = await generateDailySummary(
      agentId,
      channelId,
      agent.provider || "anthropic",
      agent.model || "claude-sonnet-4-6"
    );

    res.json({ data: { summary } });
  } catch (err) {
    console.error("Generate daily summary error:", err);
    res.status(500).json({ error: "Failed to generate daily summary" });
  }
});
