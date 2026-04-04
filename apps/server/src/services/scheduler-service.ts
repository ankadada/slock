import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { getProviderConfig } from "../routes/settings.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@slock/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../../data");
const SCHEDULES_FILE = path.join(DATA_DIR, "schedules.json");

// ============================================================
// Schedule Types
// ============================================================

export interface AgentSchedule {
  id: string;
  agentId: string;
  agentName: string;
  channelId: string;
  channelName: string;
  name: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

// ============================================================
// Cron Parser
// ============================================================

/**
 * Parse a single cron field and check if a given value matches.
 * Supports: *, N, N-M, * /N (step), lists (1,3,5), ranges with steps (1-5/2)
 */
function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  // Handle lists: "1,3,5"
  if (field.includes(",")) {
    return field.split(",").some((part) => fieldMatches(part.trim(), value, min, max));
  }

  // Handle "*/N" (every N)
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Handle "*"
  if (field === "*") {
    return true;
  }

  // Handle "N-M" (range) and "N-M/S" (range with step)
  if (field.includes("-")) {
    const [rangePart, stepPart] = field.split("/");
    const [startStr, endStr] = rangePart.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end)) return false;

    if (stepPart) {
      const step = parseInt(stepPart, 10);
      if (isNaN(step) || step <= 0) return false;
      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    }

    return value >= start && value <= end;
  }

  // Handle plain number
  const num = parseInt(field, 10);
  return !isNaN(num) && num === value;
}

/**
 * Check if a cron expression matches a given date.
 * Format: minute hour dayOfMonth month dayOfWeek
 *
 * Supports:
 *   * * * * *        (every minute)
 *   0 9 * * *        (daily at 9am)
 *   0 9 * * 1-5      (weekdays at 9am)
 *   * /30 * * * *     (every 30 minutes)
 *   0 0 * * 0        (weekly on Sunday)
 */
export function cronMatches(cronExpr: string, date: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dayOfWeek = date.getDay(); // 0=Sunday

  return (
    fieldMatches(minuteField, minute, 0, 59) &&
    fieldMatches(hourField, hour, 0, 23) &&
    fieldMatches(dayOfMonthField, dayOfMonth, 1, 31) &&
    fieldMatches(monthField, month, 1, 12) &&
    fieldMatches(dayOfWeekField, dayOfWeek, 0, 6)
  );
}

/**
 * Calculate the next run time for a cron expression from a given start date.
 * Searches up to 7 days ahead, checking each minute.
 */
export function calculateNextRun(cronExpr: string, from: Date = new Date()): string | undefined {
  const check = new Date(from);
  // Start from the next full minute
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  const maxChecks = 7 * 24 * 60; // 7 days of minutes
  for (let i = 0; i < maxChecks; i++) {
    if (cronMatches(cronExpr, check)) {
      return check.toISOString();
    }
    check.setMinutes(check.getMinutes() + 1);
  }
  return undefined;
}

/**
 * Return a human-readable description of a cron expression.
 */
export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const formatHour = (h: number): string => {
    if (h === 0) return "12:00 AM";
    if (h === 12) return "12:00 PM";
    if (h < 12) return `${h}:00 AM`;
    return `${h - 12}:00 PM`;
  };

  const formatTime = (m: string, h: string): string => {
    const hNum = parseInt(h, 10);
    const mNum = parseInt(m, 10);
    if (isNaN(hNum) || isNaN(mNum)) return "";
    const period = hNum >= 12 ? "PM" : "AM";
    const displayH = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
    const displayM = mNum.toString().padStart(2, "0");
    return `${displayH}:${displayM} ${period}`;
  };

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const step = minute.slice(2);
    return `Every ${step} minutes`;
  }

  // Every minute
  if (minute === "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every minute";
  }

  // Every hour at minute N: N * * * *
  if (!minute.includes("*") && !minute.includes("/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const m = parseInt(minute, 10);
    if (m === 0) return "Every hour";
    return `Every hour at minute ${m}`;
  }

  // Every N hours: 0 */N * * *
  if (minute === "0" && hour.startsWith("*/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const step = hour.slice(2);
    return `Every ${step} hours`;
  }

  // Specific time patterns
  const hasSpecificTime = !minute.includes("*") && !minute.includes("/") && !hour.includes("*") && !hour.includes("/");

  if (hasSpecificTime) {
    const timeStr = formatTime(minute, hour);

    // Weekday pattern: 0 9 * * 1-5
    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
      return `Weekdays at ${timeStr}`;
    }

    // Specific day of week
    const dayNames: Record<string, string> = {
      "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
      "4": "Thursday", "5": "Friday", "6": "Saturday",
    };

    if (dayOfMonth === "*" && month === "*" && dayNames[dayOfWeek]) {
      return `Every ${dayNames[dayOfWeek]} at ${timeStr}`;
    }

    // Daily: 0 9 * * *
    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return `Every day at ${timeStr}`;
    }

    // Monthly: 0 9 15 * *
    if (!dayOfMonth.includes("*") && month === "*" && dayOfWeek === "*") {
      const d = parseInt(dayOfMonth, 10);
      const suffix = d === 1 || d === 21 || d === 31 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
      return `Monthly on the ${d}${suffix} at ${timeStr}`;
    }
  }

  return expr;
}

// ============================================================
// File I/O
// ============================================================

export function loadSchedules(): AgentSchedule[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SCHEDULES_FILE)) {
      const raw = fs.readFileSync(SCHEDULES_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load schedules:", err);
  }
  return [];
}

export function saveSchedules(schedules: AgentSchedule[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
  } catch (err) {
    console.error("Failed to save schedules:", err);
  }
}

// ============================================================
// CRUD
// ============================================================

export function createSchedule(
  data: Omit<AgentSchedule, "id" | "createdAt" | "nextRun">
): AgentSchedule {
  const schedules = loadSchedules();
  const schedule: AgentSchedule = {
    ...data,
    id: uuid(),
    createdAt: new Date().toISOString(),
    nextRun: data.enabled ? calculateNextRun(data.cron) : undefined,
  };
  schedules.push(schedule);
  saveSchedules(schedules);
  return schedule;
}

export function updateSchedule(
  id: string,
  updates: Partial<AgentSchedule>
): AgentSchedule {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error("Schedule not found");

  const schedule = { ...schedules[idx], ...updates };
  // Recalculate nextRun if cron or enabled changed
  if (updates.cron !== undefined || updates.enabled !== undefined) {
    schedule.nextRun = schedule.enabled ? calculateNextRun(schedule.cron) : undefined;
  }
  schedules[idx] = schedule;
  saveSchedules(schedules);
  return schedule;
}

export function deleteSchedule(id: string): void {
  const schedules = loadSchedules();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) throw new Error("Schedule not found");
  saveSchedules(filtered);
}

export function getSchedules(filter?: {
  channelId?: string;
  agentId?: string;
}): AgentSchedule[] {
  let schedules = loadSchedules();
  if (filter?.channelId) {
    schedules = schedules.filter((s) => s.channelId === filter.channelId);
  }
  if (filter?.agentId) {
    schedules = schedules.filter((s) => s.agentId === filter.agentId);
  }
  return schedules;
}

// ============================================================
// Execute a Scheduled Task
// ============================================================

async function callAI(
  provider: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(`API key for provider "${provider}" not configured.`);
  }

  if (provider === "anthropic") {
    const client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } else {
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }
}

export async function executeScheduledTask(
  schedule: AgentSchedule,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  console.log(`[Scheduler] Executing: "${schedule.name}" (agent: ${schedule.agentName}, channel: ${schedule.channelName})`);

  try {
    // 1. Get the agent config from DB
    const agent = await prisma.agentConfig.findUnique({
      where: { id: schedule.agentId },
    });
    if (!agent) {
      console.error(`[Scheduler] Agent ${schedule.agentId} not found, skipping`);
      return;
    }

    // 2. Get recent channel context for richer responses
    const recentMessages = await prisma.message.findMany({
      where: { channelId: schedule.channelId },
      include: {
        user: { select: { username: true } },
        agent: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const contextLines = recentMessages
      .reverse()
      .map((msg) => {
        const sender = msg.user?.username || msg.agent?.name || "System";
        return `[${sender}]: ${msg.content}`;
      })
      .join("\n");

    const systemPrompt =
      agent.systemPrompt +
      `\n\nYou are "${agent.name}" in the "${schedule.channelName}" channel. ` +
      `You are executing a scheduled task: "${schedule.name}". ` +
      `Respond naturally as a team member. Be concise and actionable.`;

    const userPrompt =
      schedule.prompt +
      (contextLines
        ? `\n\nRecent channel activity for context:\n${contextLines}`
        : "\n\n(No recent messages in this channel)");

    // 3. Call AI with the schedule's prompt + channel context
    const responseText = await callAI(
      agent.provider || "anthropic",
      agent.model || "claude-sonnet-4-6",
      systemPrompt,
      userPrompt
    );

    if (!responseText.trim()) {
      console.log(`[Scheduler] Empty response for "${schedule.name}", skipping message`);
      return;
    }

    // 4. Save response as a message in the channel
    const messageId = uuid();
    const savedMessage = await prisma.message.create({
      data: {
        id: messageId,
        content: responseText,
        type: "agent",
        agentId: agent.id,
        channelId: schedule.channelId,
      },
      include: {
        agent: { select: { id: true, name: true, role: true, avatar: true } },
      },
    });

    // 5. Emit message:new socket event
    io.to(schedule.channelId).emit("message:new", {
      id: savedMessage.id,
      content: savedMessage.content,
      type: savedMessage.type as "agent",
      agentId: savedMessage.agentId ?? undefined,
      channelId: savedMessage.channelId,
      createdAt: savedMessage.createdAt.toISOString(),
      updatedAt: savedMessage.updatedAt.toISOString(),
      agent: savedMessage.agent
        ? {
            id: savedMessage.agent.id,
            name: savedMessage.agent.name,
            role: savedMessage.agent.role,
            avatar: savedMessage.agent.avatar,
          }
        : undefined,
    } as any);

    // 6. Update lastRun timestamp
    const schedules = loadSchedules();
    const idx = schedules.findIndex((s) => s.id === schedule.id);
    if (idx !== -1) {
      schedules[idx].lastRun = new Date().toISOString();
      schedules[idx].nextRun = calculateNextRun(schedule.cron);
      saveSchedules(schedules);
    }

    console.log(`[Scheduler] Completed: "${schedule.name}" - posted message ${messageId}`);
  } catch (err) {
    console.error(`[Scheduler] Failed to execute "${schedule.name}":`, err);
  }
}

// ============================================================
// Scheduler Loop
// ============================================================

// Track which schedules already ran in the current minute to avoid duplicates
const ranThisMinute = new Map<string, string>(); // scheduleId -> "YYYY-MM-DD HH:mm"

function getCurrentMinuteKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * Start the scheduler loop. Call once at server startup.
 * Checks every 60 seconds for schedules that match the current minute.
 */
export function startScheduler(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  console.log("[Scheduler] Starting scheduler loop (60s interval)");

  const tick = () => {
    const now = new Date();
    const minuteKey = getCurrentMinuteKey();

    // Clean up stale entries from ranThisMinute
    for (const [id, key] of ranThisMinute.entries()) {
      if (key !== minuteKey) {
        ranThisMinute.delete(id);
      }
    }

    const schedules = loadSchedules().filter((s) => s.enabled);

    for (const schedule of schedules) {
      // Skip if already ran this minute
      if (ranThisMinute.get(schedule.id) === minuteKey) {
        continue;
      }

      if (cronMatches(schedule.cron, now)) {
        ranThisMinute.set(schedule.id, minuteKey);
        // Fire and forget - don't block the loop
        executeScheduledTask(schedule, io).catch((err) => {
          console.error(`[Scheduler] Unhandled error in task "${schedule.name}":`, err);
        });
      }
    }
  };

  // Run immediately on startup to catch any schedules due now
  tick();

  // Then run every 60 seconds
  setInterval(tick, 60_000);
}
