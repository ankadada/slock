import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScheduleStore } from "@/stores/schedule-store";
import { useChannelStore } from "@/stores/channel-store";
import { useAgentStore } from "@/stores/agent-store";
import {
  Plus,
  Trash2,
  Play,
  Clock,
  Calendar,
  Bot,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSchedule } from "@/lib/api";

// ============================================================
// Cron Description (client-side mirror of server logic)
// ============================================================

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const formatTime = (m: string, h: string): string => {
    const hNum = parseInt(h, 10);
    const mNum = parseInt(m, 10);
    if (isNaN(hNum) || isNaN(mNum)) return "";
    const period = hNum >= 12 ? "PM" : "AM";
    const displayH = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
    const displayM = mNum.toString().padStart(2, "0");
    return `${displayH}:${displayM} ${period}`;
  };

  if (
    minute.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Every ${minute.slice(2)} minutes`;
  }

  if (
    minute === "*" &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "Every minute";
  }

  if (
    !minute.includes("*") &&
    !minute.includes("/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    const m = parseInt(minute, 10);
    if (m === 0) return "Every hour";
    return `Every hour at minute ${m}`;
  }

  if (
    minute === "0" &&
    hour.startsWith("*/") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Every ${hour.slice(2)} hours`;
  }

  const hasSpecificTime =
    !minute.includes("*") &&
    !minute.includes("/") &&
    !hour.includes("*") &&
    !hour.includes("/");

  if (hasSpecificTime) {
    const timeStr = formatTime(minute, hour);

    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
      return `Weekdays at ${timeStr}`;
    }

    const dayNames: Record<string, string> = {
      "0": "Sunday",
      "1": "Monday",
      "2": "Tuesday",
      "3": "Wednesday",
      "4": "Thursday",
      "5": "Friday",
      "6": "Saturday",
    };

    if (dayOfMonth === "*" && month === "*" && dayNames[dayOfWeek]) {
      return `Every ${dayNames[dayOfWeek]} at ${timeStr}`;
    }

    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return `Every day at ${timeStr}`;
    }
  }

  return expr;
}

// ============================================================
// Cron Presets
// ============================================================

const CRON_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day 9am", cron: "0 9 * * *" },
  { label: "Weekdays 9am", cron: "0 9 * * 1-5" },
  { label: "Weekly Monday", cron: "0 9 * * 1" },
  { label: "Every 30 min", cron: "*/30 * * * *" },
  { label: "Daily midnight", cron: "0 0 * * *" },
];

// ============================================================
// Props
// ============================================================

interface ScheduleEditorProps {
  open: boolean;
  onClose: () => void;
}

// ============================================================
// Main Component
// ============================================================

export function ScheduleEditor({ open, onClose }: ScheduleEditorProps) {
  const [view, setView] = useState<"list" | "create">("list");

  const schedules = useScheduleStore((s) => s.schedules);
  const isLoading = useScheduleStore((s) => s.isLoading);
  const fetchSchedules = useScheduleStore((s) => s.fetchSchedules);
  const updateSchedule = useScheduleStore((s) => s.updateSchedule);
  const deleteScheduleFn = useScheduleStore((s) => s.deleteSchedule);
  const runScheduleNow = useScheduleStore((s) => s.runScheduleNow);

  const activeChannelId = useChannelStore((s) => s.activeChannelId);

  useEffect(() => {
    if (open) {
      fetchSchedules(activeChannelId || undefined);
    }
  }, [open, activeChannelId, fetchSchedules]);

  const handleToggleEnabled = async (schedule: AgentSchedule) => {
    try {
      await updateSchedule(schedule.id, { enabled: !schedule.enabled });
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteScheduleFn(id);
    } catch {
      // ignore
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await runScheduleNow(id);
    } catch {
      // ignore
    }
  };

  const handleCreated = () => {
    setView("list");
    fetchSchedules(activeChannelId || undefined);
  };

  const formatDate = (iso?: string): string => {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Today ${time}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Scheduled Tasks
        </div>
      </DialogTitle>
      <DialogDescription>
        Set up agents to run on a schedule -- daily standups, periodic reports,
        channel monitoring, and more.
      </DialogDescription>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView("list")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            view === "list"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          All Schedules
        </button>
        <button
          onClick={() => setView("create")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            view === "create"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Plus className="h-3.5 w-3.5 inline mr-1" />
          New Schedule
        </button>
      </div>

      {view === "list" ? (
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">Loading schedules...</p>
            </div>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2" />
              <p className="text-sm">No scheduled tasks yet.</p>
              <p className="text-xs mt-1">
                Create one to have agents run on a schedule.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={cn(
                    "rounded-lg border p-3 transition-opacity",
                    !schedule.enabled && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {schedule.name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {schedule.agentName} in #{schedule.channelName}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {schedule.cronDescription || describeCron(schedule.cron)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {schedule.prompt}
                      </p>
                      <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span>Last: {formatDate(schedule.lastRun)}</span>
                        <span>Next: {formatDate(schedule.nextRun)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Enable/Disable toggle */}
                      <button
                        onClick={() => handleToggleEnabled(schedule)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                          schedule.enabled ? "bg-primary" : "bg-muted"
                        )}
                        title={schedule.enabled ? "Disable" : "Enable"}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
                            schedule.enabled
                              ? "translate-x-4"
                              : "translate-x-0.5"
                          )}
                        />
                      </button>
                      {/* Run Now */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRunNow(schedule.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Run Now"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(schedule.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <CreateScheduleForm onCreated={handleCreated} onCancel={() => setView("list")} />
        </ScrollArea>
      )}
    </Dialog>
  );
}

// ============================================================
// Create Form
// ============================================================

function CreateScheduleForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createSchedule = useScheduleStore((s) => s.createSchedule);
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);

  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });

  // Agents available in this channel
  const channelAgents = activeChannel?.agents || [];

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Auto-select first agent if only one
  useEffect(() => {
    if (channelAgents.length === 1 && !agentId) {
      setAgentId(channelAgents[0].id);
    }
  }, [channelAgents, agentId]);

  const selectedAgent = agents.find((a) => a.id === agentId);
  const cronDescription = describeCron(cron);
  const isValidCron = cron.trim().split(/\s+/).length === 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !agentId || !cron.trim() || !prompt.trim() || !activeChannelId) return;

    setIsSubmitting(true);
    setError("");
    try {
      await createSchedule({
        agentId,
        agentName: selectedAgent?.name || "Unknown Agent",
        channelId: activeChannelId,
        channelName: activeChannel?.name || "Unknown Channel",
        name: name.trim(),
        cron: cron.trim(),
        prompt: prompt.trim(),
        enabled: true,
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create schedule"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to list
      </button>

      {/* Agent selection */}
      <div>
        <label className="text-sm font-medium text-foreground">Agent</label>
        {channelAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            No agents in this channel. Add an agent first.
          </p>
        ) : (
          <div className="mt-1 space-y-1.5">
            {channelAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setAgentId(agent.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors",
                  agentId === agent.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:bg-accent"
                )}
              >
                <Bot className="h-4 w-4 shrink-0" />
                <span className="font-medium">{agent.name}</span>
                <span className="text-xs opacity-60 ml-auto">{agent.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Schedule name */}
      <div>
        <label className="text-sm font-medium text-foreground">
          Schedule Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily Standup Summary"
          className="mt-1"
        />
      </div>

      {/* Cron expression */}
      <div>
        <label className="text-sm font-medium text-foreground">Schedule</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.cron}
              type="button"
              onClick={() => setCron(preset.cron)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                cron === preset.cron
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="e.g. 0 9 * * 1-5"
          className="mt-2 font-mono text-xs"
        />
        {cron && (
          <p
            className={cn(
              "text-xs mt-1",
              isValidCron ? "text-muted-foreground" : "text-destructive"
            )}
          >
            {isValidCron ? cronDescription : "Invalid cron expression (need 5 fields: min hour day month weekday)"}
          </p>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="text-sm font-medium text-foreground">Prompt</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-1">
          What should the agent do when this schedule runs?
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Generate a summary of yesterday's discussions and list action items for today."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={4}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !name.trim() ||
            !agentId ||
            !isValidCron ||
            !prompt.trim() ||
            isSubmitting ||
            channelAgents.length === 0
          }
        >
          {isSubmitting ? "Creating..." : "Create Schedule"}
        </Button>
      </div>
    </form>
  );
}
