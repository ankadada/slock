import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET } from "../lib/jwt-config.js";
import { processMessage, evaluateAndRespond, triageAndRoute, processUIAction } from "../services/agent-service.js";
import { startWorkflow, approveStep } from "../services/workflow-service.js";
import {
  getChannelState,
  classifyUserResponse,
  flushPendingTriggers,
  clearState,
} from "../services/conversation-state.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@slock/shared";
import type { AuthUser } from "../middleware/auth.js";

// Track online users: socketId -> userId
const onlineUsers = new Map<string, string>();

/** Check if a user is a member of a channel */
async function isChannelMember(userId: string, channelId: string): Promise<boolean> {
  const membership = await prisma.channelMember.findFirst({
    where: { userId, channelId },
  });
  return !!membership;
}

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(
        token,
        JWT_SECRET
      ) as AuthUser;
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const user = (socket as any).user as AuthUser;
    console.log(`User connected: ${user.username} (${user.id})`);

    // Track online status
    onlineUsers.set(socket.id, user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true },
    });
    io.emit("user:online", user.id);

    // Auto-join user's channels
    const memberships = await prisma.channelMember.findMany({
      where: { userId: user.id },
    });
    for (const m of memberships) {
      socket.join(m.channelId);
    }

    // === Message Events ===
    socket.on("message:send", async (data) => {
      try {
        const { content, channelId, parentId } = data;

        // Verify membership before allowing message
        if (!(await isChannelMember(user.id, channelId))) {
          return;
        }

        // Save message to DB
        const message = await prisma.message.create({
          data: {
            content,
            type: "text",
            userId: user.id,
            channelId,
            parentId,
          },
          include: {
            user: { select: { id: true, username: true, avatar: true, isOnline: true } },
          },
        });

        // Broadcast to channel
        io.to(channelId).emit("message:new", {
          id: message.id,
          content: message.content,
          type: "text",
          userId: message.userId,
          channelId: message.channelId,
          parentId: message.parentId,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          user: message.user
            ? {
                id: message.user.id,
                username: message.user.username,
                avatar: message.user.avatar,
                isOnline: message.user.isOnline,
                email: "",
                createdAt: "",
              }
            : undefined,
        });

        // Check if channel is awaiting user response (from a conditional @mention)
        const channelState = getChannelState(channelId);
        if (channelState.status === "awaiting_user") {
          const userMentions = content.match(/@(\w+)/g)?.map((m) => m.slice(1).toLowerCase()) || [];
          const responseType = classifyUserResponse(content, channelState, userMentions);

          if (responseType === "confirmation" || responseType === "explicit_mention") {
            const triggers = flushPendingTriggers(channelId);
            clearState(channelId);

            // Process user message normally first
            if (content.match(/@\w+/)) {
              await processMessage(content, channelId, io);
            } else {
              await triageAndRoute(content, channelId, user.id, io);
            }

            // Then fire queued triggers
            for (const trigger of triggers) {
              await processMessage(
                `@${trigger.mentionedAgentName} ${channelState.questionContext || ""}`,
                channelId,
                io
              );
            }
            return; // handled
          } else if (responseType === "rejection") {
            clearState(channelId);
            // fall through to normal processing
          } else {
            clearState(channelId);
            // topic change, fall through
          }
        }

        // If message has @mentions, use direct mention flow (always respond).
        // Otherwise, let agents autonomously evaluate whether to respond.
        if (content.match(/@\w+/)) {
          await processMessage(content, channelId, io);
        } else {
          await triageAndRoute(content, channelId, user.id, io);
        }
      } catch (err) {
        console.error("message:send error:", err);
      }
    });

    // === Channel Events ===
    socket.on("channel:join", async (channelId) => {
      // Verify membership before joining socket room
      if (await isChannelMember(user.id, channelId)) {
        socket.join(channelId);
      }
    });

    socket.on("channel:leave", (channelId) => {
      socket.leave(channelId);
    });

    // === Thread Events ===
    (socket as any).on("thread:join", async (threadId: string) => {
      try {
        const thread = await prisma.channel.findFirst({
          where: { id: threadId, type: "thread" },
        });
        if (!thread || !thread.parentChannelId) return;
        if (!(await isChannelMember(user.id, thread.parentChannelId))) return;

        // Auto-add as member if not already
        await prisma.channelMember.upsert({
          where: {
            userId_channelId: { userId: user.id, channelId: threadId },
          },
          create: { userId: user.id, channelId: threadId, role: "member" },
          update: {},
        });

        socket.join(threadId);
      } catch (err) {
        console.error("thread:join error:", err);
      }
    });

    // === Presence Events ===
    socket.on("user:typing", (channelId) => {
      socket.to(channelId).emit("user:typing", {
        userId: user.id,
        channelId,
      });
    });

    // === UI Action Events ===
    socket.on("ui:action", async (data) => {
      try {
        await processUIAction(data.messageId, data.actionId, data.payload, io);
      } catch (err) {
        console.error("ui:action error:", err);
      }
    });

    // === Workflow Events ===
    socket.on("workflow:start", async (workflowId) => {
      try {
        // Verify user has access to this workflow's channel
        const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
        if (!workflow || !(await isChannelMember(user.id, workflow.channelId))) {
          return;
        }
        await startWorkflow(workflowId, io);
      } catch (err) {
        console.error("workflow:start error:", err);
      }
    });

    socket.on("workflow:pause", async (workflowId) => {
      try {
        const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
        if (!workflow || !(await isChannelMember(user.id, workflow.channelId))) {
          return;
        }
        await prisma.workflow.update({
          where: { id: workflowId },
          data: { status: "paused" },
        });
      } catch (err) {
        console.error("workflow:pause error:", err);
      }
    });

    socket.on("workflow:approve_step", async (data) => {
      try {
        const workflow = await prisma.workflow.findUnique({ where: { id: data.workflowId } });
        if (!workflow || !(await isChannelMember(user.id, workflow.channelId))) {
          return;
        }
        await approveStep(data.workflowId, data.stepIndex, data.approved, io);
      } catch (err) {
        console.error("workflow:approve_step error:", err);
      }
    });

    // === Disconnect ===
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${user.username}`);
      onlineUsers.delete(socket.id);

      // Check if user has other active connections
      const stillOnline = [...onlineUsers.values()].includes(user.id);
      if (!stillOnline) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isOnline: false },
        });
        io.emit("user:offline", user.id);
      }
    });
  });
}
