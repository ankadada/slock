import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import type { AgentTask } from "@/stores/task-store";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

// ============================================================
// Status badge
// ============================================================

const STATUS_CONFIG: Record<
  AgentTask["status"],
  { label: string; className: string; icon: typeof Circle }
> = {
  pending: {
    label: "Pending",
    className: "bg-zinc-500/20 text-zinc-400",
    icon: Circle,
  },
  assigned: {
    label: "Assigned",
    className: "bg-sky-500/20 text-sky-400",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-500/20 text-blue-400",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    className: "bg-green-500/20 text-green-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/20 text-red-400",
    icon: AlertCircle,
  },
};

function StatusBadge({ status }: { status: AgentTask["status"] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        config.className
      )}
    >
      <Icon
        className={cn("h-3 w-3", status === "in_progress" && "animate-spin")}
      />
      {config.label}
    </span>
  );
}

// ============================================================
// Single task card (used inside task-board and chat)
// ============================================================

interface TaskCardProps {
  task: AgentTask;
  compact?: boolean;
}

export function TaskCard({ task, compact = false }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 transition-colors",
        task.status === "in_progress" && "border-blue-500/30",
        task.status === "completed" && "border-green-500/30",
        task.status === "failed" && "border-red-500/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              compact ? "truncate" : ""
            )}
          >
            {task.title}
          </p>
          {task.assignedAgentName && (
            <div className="mt-1 flex items-center gap-1.5">
              <Avatar
                name={task.assignedAgentName}
                size="sm"
                isAgent
              />
              <span className="text-xs text-muted-foreground">
                {task.assignedAgentName}
              </span>
            </div>
          )}
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* Expandable description / result */}
      {!compact && (task.description || task.result) && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <div className="mt-1.5 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
              {task.result ? (
                <p className="whitespace-pre-wrap break-words">
                  {task.result.slice(0, 500)}
                  {task.result.length > 500 ? "..." : ""}
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words">
                  {task.description}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Task group card (renders in chat when manager posts tasks)
// ============================================================

interface TaskGroupCardProps {
  parentTaskId?: string;
  tasks: {
    id: string;
    title: string;
    status: AgentTask["status"];
    assignedAgentName?: string;
    assignedAgentId?: string;
  }[];
}

export function TaskGroupCard({ tasks }: TaskGroupCardProps) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="mt-2 rounded-lg border bg-card/50 p-3 max-w-md">
      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progress</span>
          <span>
            {completed}/{total} tasks
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progress === 100 ? "bg-green-500" : "bg-blue-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <StatusIcon status={task.status} />
              <span className="truncate">{task.title}</span>
            </div>
            {task.assignedAgentName && (
              <span className="shrink-0 text-xs text-muted-foreground">
                @{task.assignedAgentName}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: AgentTask["status"] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Icon
      className={cn(
        "h-4 w-4 shrink-0",
        status === "pending" && "text-zinc-400",
        status === "assigned" && "text-sky-400",
        status === "in_progress" && "text-blue-400 animate-spin",
        status === "completed" && "text-green-400",
        status === "failed" && "text-red-400"
      )}
    />
  );
}
