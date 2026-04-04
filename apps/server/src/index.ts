import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@slock/shared";
import { authRouter } from "./routes/auth.js";
import { channelRouter } from "./routes/channels.js";
import { messageRouter } from "./routes/messages.js";
import { agentRouter } from "./routes/agents.js";
import { workflowRouter } from "./routes/workflows.js";
import { settingsRouter } from "./routes/settings.js";
import { inviteRouter } from "./routes/invites.js";
import { threadRouter } from "./routes/threads.js";
import { authMiddleware } from "./middleware/auth.js";
import { setupSocketHandlers } from "./socket/index.js";
import { prisma } from "./lib/prisma.js";
import { memoryRouter } from "./routes/memories.js";
import { taskRouter } from "./routes/tasks.js";
import { createSchedulesRouter } from "./routes/schedules.js";
import { startScheduler } from "./services/scheduler-service.js";

// Validate required environment variables
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "change-this-in-production") {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET must be set to a secure value in production");
    process.exit(1);
  }
  console.warn("WARNING: Using default JWT_SECRET - set JWT_SECRET in .env for security");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173"],
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? false : "http://localhost:5173",
}));
app.use(express.json());

// Public invite validation (no auth needed)
app.get("/api/invites/validate/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const invite = await prisma.invite.findUnique({
      where: { code },
    });

    if (!invite || !invite.isActive) {
      res.json({ data: { valid: false, message: "Invalid or inactive invite" } });
      return;
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      res.json({ data: { valid: false, message: "Invite has expired" } });
      return;
    }
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      res.json({ data: { valid: false, message: "Invite has reached maximum uses" } });
      return;
    }

    res.json({ data: { valid: true } });
  } catch (err) {
    console.error("Validate invite error:", err);
    res.status(500).json({ error: "Failed to validate invite" });
  }
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/channels", authMiddleware, channelRouter);
app.use("/api/messages", authMiddleware, messageRouter);
app.use("/api/agents", authMiddleware, agentRouter);
app.use("/api/workflows", authMiddleware, workflowRouter);
app.use("/api/settings", authMiddleware, settingsRouter);
app.use("/api/invites", inviteRouter);
app.use("/api/threads", authMiddleware, threadRouter);
app.use("/api/memories", authMiddleware, memoryRouter);
app.use("/api/tasks", authMiddleware, taskRouter);
app.use("/api/schedules", authMiddleware, createSchedulesRouter(io));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const webDist = path.join(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

// Socket.IO
setupSocketHandlers(io);

const PORT = parseInt(process.env.PORT || "3000", 10);
server.listen(PORT, () => {
  console.log(`Slock server running on http://localhost:${PORT}`);
  startScheduler(io);
  console.log("Scheduler started");
});

export { io };
