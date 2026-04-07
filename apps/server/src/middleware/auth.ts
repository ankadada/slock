import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/jwt-config.js";
import { prisma } from "../lib/prisma.js";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  platformRole: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    // Re-fetch platformRole from DB to ensure role changes take effect immediately
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { platformRole: true },
    });
    if (!currentUser) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    req.user = { ...decoded, platformRole: currentUser.platformRole };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Require platform admin (superadmin or admin) role.
 * Must be used AFTER authMiddleware.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.user.platformRole !== "superadmin" && req.user.platformRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * Require superadmin role specifically.
 * Must be used AFTER authMiddleware.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.user.platformRole !== "superadmin") {
    res.status(403).json({ error: "Superadmin access required" });
    return;
  }
  next();
}

/**
 * Check if user is a member of a specific channel.
 * Reads channelId from req.params.channelId or req.params.id
 */
export async function requireChannelMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const channelId = req.params.channelId || req.params.id;
  if (!channelId) {
    res.status(400).json({ error: "Channel ID required" });
    return;
  }

  const membership = await prisma.channelMember.findUnique({
    where: {
      userId_channelId: { userId: req.user.id, channelId },
    },
  });

  if (!membership) {
    // Superadmin bypasses membership check
    if (req.user.platformRole === "superadmin") {
      next();
      return;
    }
    res.status(403).json({ error: "Not a member of this channel" });
    return;
  }

  next();
}

/**
 * Check if user is an admin of the specific channel.
 */
export async function requireChannelAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Platform superadmin always passes
  if (req.user.platformRole === "superadmin") {
    next();
    return;
  }

  const channelId = req.params.channelId || req.params.id;
  if (!channelId) {
    res.status(400).json({ error: "Channel ID required" });
    return;
  }

  const membership = await prisma.channelMember.findUnique({
    where: {
      userId_channelId: { userId: req.user.id, channelId },
    },
  });

  if (!membership || membership.role !== "admin") {
    res.status(403).json({ error: "Channel admin access required" });
    return;
  }

  next();
}
