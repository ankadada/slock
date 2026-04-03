import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const threadRouter = Router();

const createThreadSchema = z.object({
  name: z.string().min(1).max(80),
  sourceMessageId: z.string().optional(),
  agentIds: z.array(z.string()).optional(),
});

// Create a thread under a channel: POST /api/channels/:id/threads
// (mounted via channelRouter, see channels.ts)
export async function createThread(req: Request, res: Response) {
  try {
    const parentChannelId = req.params.id;
    const body = createThreadSchema.parse(req.body);

    // Verify caller is a member of the parent channel
    const membership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: parentChannelId },
    });
    if (!membership) {
      res.status(403).json({ error: "Not a member of the parent channel" });
      return;
    }

    // Verify the parent channel exists and is not itself a thread
    const parentChannel = await prisma.channel.findUnique({
      where: { id: parentChannelId },
      include: { agents: true },
    });
    if (!parentChannel) {
      res.status(404).json({ error: "Parent channel not found" });
      return;
    }
    if (parentChannel.type === "thread") {
      res.status(400).json({ error: "Cannot create a thread inside a thread" });
      return;
    }

    // If sourceMessageId is provided, verify it belongs to the parent channel
    if (body.sourceMessageId) {
      const sourceMsg = await prisma.message.findFirst({
        where: { id: body.sourceMessageId, channelId: parentChannelId },
      });
      if (!sourceMsg) {
        res.status(400).json({ error: "Source message not found in this channel" });
        return;
      }
    }

    // Determine which agents to copy
    const agentIdsToAdd = body.agentIds
      ? body.agentIds.filter((aid) =>
          parentChannel.agents.some((ca) => ca.agentId === aid)
        )
      : [];

    // Create the thread (as a Channel with type "thread")
    const thread = await prisma.channel.create({
      data: {
        name: body.name,
        type: "thread",
        parentChannelId,
        sourceMessageId: body.sourceMessageId,
        members: {
          create: { userId: req.user!.id, role: "admin" },
        },
        agents: agentIdsToAdd.length > 0
          ? {
              create: agentIdsToAdd.map((agentId) => ({ agentId })),
            }
          : undefined,
      },
      include: {
        _count: { select: { members: true } },
        agents: { include: { agent: true } },
      },
    });

    res.json({
      data: {
        id: thread.id,
        name: thread.name,
        type: thread.type,
        parentChannelId: thread.parentChannelId,
        sourceMessageId: thread.sourceMessageId,
        archivedAt: thread.archivedAt?.toISOString() || null,
        createdAt: thread.createdAt.toISOString(),
        memberCount: thread._count.members,
        agents: thread.agents.map((ca) => ({
          id: ca.agent.id,
          name: ca.agent.name,
          role: ca.agent.role,
          avatar: ca.agent.avatar,
          isActive: ca.agent.isActive,
        })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Create thread error:", err);
    res.status(500).json({ error: "Failed to create thread" });
  }
}

// List active threads for a channel: GET /api/channels/:id/threads
export async function listThreads(req: Request, res: Response) {
  try {
    const parentChannelId = req.params.id;

    // Verify caller is a member of the parent channel
    const membership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: parentChannelId },
    });
    if (!membership) {
      res.status(403).json({ error: "Not a member of the parent channel" });
      return;
    }

    const threads = await prisma.channel.findMany({
      where: {
        parentChannelId,
        type: "thread",
        archivedAt: null,
      },
      include: {
        _count: { select: { members: true, messages: true } },
        agents: { include: { agent: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      data: threads.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        parentChannelId: t.parentChannelId,
        sourceMessageId: t.sourceMessageId,
        archivedAt: t.archivedAt?.toISOString() || null,
        createdAt: t.createdAt.toISOString(),
        memberCount: t._count.members,
        messageCount: t._count.messages,
        agents: t.agents.map((ca) => ({
          id: ca.agent.id,
          name: ca.agent.name,
          role: ca.agent.role,
          avatar: ca.agent.avatar,
          isActive: ca.agent.isActive,
        })),
      })),
    });
  } catch (err) {
    console.error("List threads error:", err);
    res.status(500).json({ error: "Failed to list threads" });
  }
}

// GET /api/threads/:id — get thread detail
threadRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const thread = await prisma.channel.findFirst({
      where: { id: req.params.id, type: "thread" },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, avatar: true, isOnline: true } },
          },
        },
        agents: { include: { agent: true } },
        parentChannel: { select: { id: true, name: true, type: true } },
      },
    });

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    // Verify caller is a member of the parent channel
    const membership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: thread.parentChannelId! },
    });
    if (!membership) {
      res.status(403).json({ error: "Not a member of the parent channel" });
      return;
    }

    res.json({
      data: {
        id: thread.id,
        name: thread.name,
        type: thread.type,
        parentChannelId: thread.parentChannelId,
        sourceMessageId: thread.sourceMessageId,
        archivedAt: thread.archivedAt?.toISOString() || null,
        createdAt: thread.createdAt.toISOString(),
        parentChannel: thread.parentChannel,
        members: thread.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          user: m.user,
        })),
        agents: thread.agents.map((ca) => ({
          id: ca.agent.id,
          name: ca.agent.name,
          role: ca.agent.role,
          avatar: ca.agent.avatar,
          description: ca.agent.description,
          isActive: ca.agent.isActive,
        })),
      },
    });
  } catch (err) {
    console.error("Get thread error:", err);
    res.status(500).json({ error: "Failed to get thread" });
  }
});

// POST /api/threads/:id/join
threadRouter.post("/:id/join", async (req: Request, res: Response) => {
  try {
    const thread = await prisma.channel.findFirst({
      where: { id: req.params.id, type: "thread" },
    });
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    // Verify caller is a member of the parent channel
    const parentMembership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: thread.parentChannelId! },
    });
    if (!parentMembership) {
      res.status(403).json({ error: "Not a member of the parent channel" });
      return;
    }

    await prisma.channelMember.upsert({
      where: {
        userId_channelId: { userId: req.user!.id, channelId: req.params.id },
      },
      create: { userId: req.user!.id, channelId: req.params.id, role: "member" },
      update: {},
    });

    res.json({ message: "Joined thread" });
  } catch (err) {
    console.error("Join thread error:", err);
    res.status(500).json({ error: "Failed to join thread" });
  }
});

// POST /api/threads/:id/leave
threadRouter.post("/:id/leave", async (req: Request, res: Response) => {
  try {
    await prisma.channelMember.deleteMany({
      where: { userId: req.user!.id, channelId: req.params.id },
    });
    res.json({ message: "Left thread" });
  } catch (err) {
    console.error("Leave thread error:", err);
    res.status(500).json({ error: "Failed to leave thread" });
  }
});

// POST /api/threads/:id/archive
threadRouter.post("/:id/archive", async (req: Request, res: Response) => {
  try {
    const thread = await prisma.channel.findFirst({
      where: { id: req.params.id, type: "thread" },
    });
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    // Only admin of the thread or parent channel can archive
    const threadMembership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: req.params.id, role: "admin" },
    });
    const parentMembership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: thread.parentChannelId!, role: "admin" },
    });

    if (!threadMembership && !parentMembership) {
      res.status(403).json({ error: "Only admins can archive threads" });
      return;
    }

    await prisma.channel.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() },
    });

    res.json({ message: "Thread archived" });
  } catch (err) {
    console.error("Archive thread error:", err);
    res.status(500).json({ error: "Failed to archive thread" });
  }
});
