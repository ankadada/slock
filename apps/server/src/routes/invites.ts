import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

export const inviteRouter = Router();

function generateCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex string
}

const createInviteSchema = z.object({
  maxUses: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
});

// All routes below require auth
inviteRouter.use(authMiddleware);

// POST / - create invite
inviteRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = createInviteSchema.parse(req.body);
    const code = generateCode();

    const invite = await prisma.invite.create({
      data: {
        code,
        createdBy: req.user!.id,
        maxUses: body.maxUses ?? 0,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    res.json({ data: { id: invite.id, code: invite.code } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Create invite error:", err);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

// GET / - list user's invites
inviteRouter.get("/", async (req: Request, res: Response) => {
  try {
    const invites = await prisma.invite.findMany({
      where: { createdBy: req.user!.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: invites });
  } catch (err) {
    console.error("List invites error:", err);
    res.status(500).json({ error: "Failed to list invites" });
  }
});

// DELETE /:id - deactivate invite
inviteRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const invite = await prisma.invite.findFirst({
      where: { id: req.params.id, createdBy: req.user!.id },
    });

    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    await prisma.invite.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ data: { success: true } });
  } catch (err) {
    console.error("Delete invite error:", err);
    res.status(500).json({ error: "Failed to deactivate invite" });
  }
});
