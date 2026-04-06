import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET } from "../lib/jwt-config.js";
import { authMiddleware } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().min(2).max(30),
  email: z.string().email(),
  password: z.string().min(6),
  inviteCode: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

function generateToken(user: { id: string; username: string; email: string }): string {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);

    // Validate invite code if provided
    if (body.inviteCode) {
      const invite = await prisma.invite.findUnique({
        where: { code: body.inviteCode },
      });
      if (!invite || !invite.isActive) {
        res.status(400).json({ error: "Invalid or inactive invite code" });
        return;
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        res.status(400).json({ error: "Invite code has expired" });
        return;
      }
      if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
        res.status(400).json({ error: "Invite code has reached maximum uses" });
        return;
      }
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username: body.username }, { email: body.email }] },
    });
    if (existing) {
      res.status(400).json({ error: "Username or email already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
      },
    });

    // Auto-join #general channel
    const general = await prisma.channel.findFirst({ where: { name: "general" } });
    if (general) {
      await prisma.channelMember.create({
        data: { userId: user.id, channelId: general.id, role: "member" },
      });
    }

    // Increment invite uses if invite code was provided
    if (body.inviteCode) {
      await prisma.invite.update({
        where: { code: body.inviteCode },
        data: { uses: { increment: 1 } },
      });
    }

    const token = generateToken(user);
    res.json({
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          isOnline: user.isOnline,
          createdAt: user.createdAt.toISOString(),
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { username: body.username },
    });
    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = generateToken(user);
    res.json({
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          isOnline: user.isOnline,
          createdAt: user.createdAt.toISOString(),
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

authRouter.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.isOnline,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Failed to get user" });
  }
});
