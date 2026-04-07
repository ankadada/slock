import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createThread, listThreads } from "./threads.js";
import { requireChannelAdmin } from "../middleware/auth.js";
import { audit } from "../services/audit-service.js";

export const channelRouter = Router();

const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().optional(),
  type: z.enum(["public", "private"]).default("public"),
});

// List user's channels (excludes threads)
channelRouter.get("/", async (req: Request, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        members: { some: { userId: req.user!.id } },
        type: { not: "thread" },
      },
      include: {
        _count: { select: { members: true, threads: true } },
        agents: { include: { agent: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      data: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        type: ch.type,
        createdAt: ch.createdAt.toISOString(),
        memberCount: ch._count.members,
        threadCount: ch._count.threads,
        agents: ch.agents.map((ca) => ({
          id: ca.agent.id,
          name: ca.agent.name,
          role: ca.agent.role,
          avatar: ca.agent.avatar,
          isActive: ca.agent.isActive,
        })),
      })),
    });
  } catch (err) {
    console.error("List channels error:", err);
    res.status(500).json({ error: "Failed to list channels" });
  }
});

// Create channel
channelRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = createChannelSchema.parse(req.body);

    const channel = await prisma.channel.create({
      data: {
        name: body.name,
        description: body.description,
        type: body.type,
        members: {
          create: { userId: req.user!.id, role: "admin" },
        },
      },
    });

    audit({
      actorId: req.user!.id,
      action: "create_channel",
      resourceType: "channel",
      resourceId: channel.id,
      ip: req.ip,
    });

    res.json({
      data: {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        createdAt: channel.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Create channel error:", err);
    res.status(500).json({ error: "Failed to create channel" });
  }
});

// Get channel detail
channelRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, avatar: true, isOnline: true } } },
        },
        agents: {
          include: { agent: true },
        },
      },
    });

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    // Membership check for private channels
    const isMember = channel.members.some((m) => m.userId === req.user!.id);
    const isAdmin = req.user!.platformRole === "superadmin" || req.user!.platformRole === "admin";
    if (!isMember && !isAdmin && channel.type === "private") {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    res.json({
      data: {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        createdAt: channel.createdAt.toISOString(),
        members: channel.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          user: m.user,
        })),
        agents: channel.agents.map((ca) => ({
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
    console.error("Get channel error:", err);
    res.status(500).json({ error: "Failed to get channel" });
  }
});

// Join channel
channelRouter.post("/:id/join", async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.id } });
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    // Private channels require a valid invite code or platform admin/superadmin role
    if (channel.type === "private") {
      const isPlatformAdmin = req.user!.platformRole === "superadmin" || req.user!.platformRole === "admin";
      if (!isPlatformAdmin) {
        const inviteCode = req.body.inviteCode as string | undefined;
        if (!inviteCode) {
          res.status(403).json({ error: "Invite code required to join private channel" });
          return;
        }
        const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
        if (!invite || !invite.isActive) {
          res.status(403).json({ error: "Invalid or expired invite code" });
          return;
        }
        if (invite.expiresAt && invite.expiresAt < new Date()) {
          res.status(403).json({ error: "Invalid or expired invite code" });
          return;
        }
        if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
          res.status(403).json({ error: "Invite code has reached maximum uses" });
          return;
        }
        // If invite is scoped to a channel, verify it matches
        if (invite.channelId && invite.channelId !== channel.id) {
          res.status(403).json({ error: "This invite code is not valid for this channel" });
          return;
        }
        // Increment invite usage
        await prisma.invite.update({ where: { id: invite.id }, data: { uses: invite.uses + 1 } });
      }
    }

    await prisma.channelMember.create({
      data: {
        userId: req.user!.id,
        channelId: req.params.id,
        role: "member",
      },
    });

    audit({
      actorId: req.user!.id,
      action: "join_channel",
      resourceType: "channel",
      resourceId: req.params.id,
      ip: req.ip,
    });

    res.json({ message: "Joined channel" });
  } catch (err) {
    console.error("Join channel error:", err);
    res.status(500).json({ error: "Failed to join channel" });
  }
});

// Leave channel
channelRouter.post("/:id/leave", async (req: Request, res: Response) => {
  try {
    await prisma.channelMember.deleteMany({
      where: { userId: req.user!.id, channelId: req.params.id },
    });

    audit({
      actorId: req.user!.id,
      action: "leave_channel",
      resourceType: "channel",
      resourceId: req.params.id,
      ip: req.ip,
    });

    res.json({ message: "Left channel" });
  } catch (err) {
    console.error("Leave channel error:", err);
    res.status(500).json({ error: "Failed to leave channel" });
  }
});

// Add agent to channel
channelRouter.post("/:id/agents", requireChannelAdmin, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    await prisma.channelAgent.create({
      data: {
        channelId: req.params.id,
        agentId,
      },
    });

    const agent = await prisma.agentConfig.findUnique({ where: { id: agentId } });
    res.json({ data: agent, message: "Agent added to channel" });
  } catch (err) {
    console.error("Add agent error:", err);
    res.status(500).json({ error: "Failed to add agent to channel" });
  }
});

// Remove agent from channel
channelRouter.delete("/:id/agents/:agentId", requireChannelAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.channelAgent.deleteMany({
      where: {
        channelId: req.params.id,
        agentId: req.params.agentId,
      },
    });
    res.json({ message: "Agent removed from channel" });
  } catch (err) {
    console.error("Remove agent error:", err);
    res.status(500).json({ error: "Failed to remove agent" });
  }
});

// Thread sub-routes under channels
channelRouter.post("/:id/threads", createThread);
channelRouter.get("/:id/threads", listThreads);
