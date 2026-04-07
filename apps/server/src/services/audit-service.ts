import { prisma } from "../lib/prisma.js";

export type AuditAction =
  | "login"
  | "register"
  | "create_agent"
  | "update_agent"
  | "delete_agent"
  | "update_settings"
  | "create_channel"
  | "delete_channel"
  | "join_channel"
  | "leave_channel"
  | "approve_workflow"
  | "reject_workflow"
  | "pause_workflow"
  | "create_schedule"
  | "update_schedule"
  | "delete_schedule"
  | "run_schedule"
  | "delete_memory"
  | "create_invite";

export type AuditResourceType =
  | "user"
  | "agent"
  | "channel"
  | "settings"
  | "workflow"
  | "schedule"
  | "memory"
  | "invite";

interface AuditEntry {
  actorId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Record an audit log entry. Fire-and-forget — errors are logged but don't
 * propagate to the caller, so auditing never breaks business logic.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
