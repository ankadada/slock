import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export const messageRouter = Router();

// Get thread replies for a message (must be before /:channelId to avoid path collision)
messageRouter.get("/thread/:parentId", async (req: Request, res: Response) => {
  try {
    // First find the parent message to get channelId
    const parent = await prisma.message.findUnique({
      where: { id: req.params.parentId },
      select: { channelId: true },
    });
    if (!parent) {
      res.status(404).json({ error: "Parent message not found" });
      return;
    }

    // Verify membership
    const membership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId: parent.channelId },
    });
    if (!membership && req.user!.platformRole !== "superadmin" && req.user!.platformRole !== "admin") {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { parentId: req.params.parentId },
      include: {
        user: { select: { id: true, username: true, avatar: true, isOnline: true } },
        agent: { select: { id: true, name: true, role: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: messages });
  } catch (err) {
    console.error("Get thread messages error:", err);
    res.status(500).json({ error: "Failed to get thread messages" });
  }
});

// Get messages for a channel (cursor-based pagination)
messageRouter.get("/:channelId", async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    // Verify membership
    const membership = await prisma.channelMember.findFirst({
      where: { userId: req.user!.id, channelId },
    });
    if (!membership && req.user!.platformRole !== "superadmin" && req.user!.platformRole !== "admin") {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const messages = await prisma.message.findMany({
      where: { channelId },
      include: {
        user: { select: { id: true, username: true, avatar: true, isOnline: true } },
        agent: { select: { id: true, name: true, role: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    // After pop + reverse: messages[0] is oldest (correct cursor for "load older")
    const nextCursor = hasMore && messages.length > 0 ? messages[0].id : undefined;

    res.json({
      data: messages.reverse().map((msg) => ({
        id: msg.id,
        content: msg.content,
        type: msg.type,
        userId: msg.userId,
        agentId: msg.agentId,
        channelId: msg.channelId,
        parentId: msg.parentId,
        uiComponent: msg.uiComponent ? JSON.parse(msg.uiComponent) : undefined,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
        user: msg.user,
        agent: msg.agent,
      })),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Failed to get messages" });
  }
});
