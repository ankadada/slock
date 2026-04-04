import { useEffect } from "react";
import { X, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore, type AgentTask } from "@/stores/task-store";
import { TaskCard } from "./task-card";

// ============================================================
// TaskBoard — Kanban-style overview of all tasks in a channel
// ============================================================

interface TaskBoardProps {
  channelId: string;
}

const COLUMNS: {
  key: string;
  label: string;
  statuses: AgentTask["status"][];
  headerColor: string;
}[] = [
  {
    key: "pending",
    label: "Pending",
    statuses: ["pending", "assigned"],
    headerColor: "text-zinc-400",
  },
  {
    key: "in_progress",
    label: "In Progress",
    statuses: ["in_progress"],
    headerColor: "text-blue-400",
  },
  {
    key: "completed",
    label: "Completed",
    statuses: ["completed"],
    headerColor: "text-green-400",
  },
  {
    key: "failed",
    label: "Failed",
    statuses: ["failed"],
    headerColor: "text-red-400",
  },
];

export function TaskBoard({ channelId }: TaskBoardProps) {
  const tasks = useTaskStore((s) => s.tasksByChannel[channelId]);
  const isLoading = useTaskStore((s) => s.isLoading);
  const showTaskBoard = useTaskStore((s) => s.showTaskBoard);
  const setShowTaskBoard = useTaskStore((s) => s.setShowTaskBoard);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  useEffect(() => {
    if (showTaskBoard && channelId) {
      fetchTasks(channelId);
    }
  }, [showTaskBoard, channelId, fetchTasks]);

  if (!showTaskBoard) return null;

  // Flatten all sub-tasks from all parent tasks
  const allSubTasks: AgentTask[] = [];
  if (tasks) {
    for (const parent of tasks) {
      if (parent.subTasks) {
        allSubTasks.push(...parent.subTasks);
      }
    }
  }

  return (
    <div className="border-b bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LayoutGrid className="h-4 w-4 text-purple-400" />
          <span>Task Board</span>
          {allSubTasks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({allSubTasks.filter((t) => t.status === "completed").length}/
              {allSubTasks.length} done)
            </span>
          )}
        </div>
        <button
          onClick={() => setShowTaskBoard(false)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Kanban columns */}
      <div className="overflow-x-auto">
        <div className="flex gap-3 p-4 min-w-[600px]">
          {COLUMNS.map((col) => {
            const colTasks = allSubTasks.filter((t) =>
              col.statuses.includes(t.status)
            );

            return (
              <div
                key={col.key}
                className="flex-1 min-w-[180px]"
              >
                {/* Column header */}
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn("text-xs font-semibold uppercase", col.headerColor)}
                  >
                    {col.label}
                  </span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {colTasks.length}
                  </span>
                </div>

                {/* Column content */}
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      No tasks
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <TaskCard key={task.id} task={task} compact />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="px-4 pb-3 text-xs text-muted-foreground">
          Loading tasks...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allSubTasks.length === 0 && (
        <div className="px-4 pb-4 text-center text-sm text-muted-foreground">
          No tasks yet. A manager agent will create tasks when processing complex requests.
        </div>
      )}
    </div>
  );
}

// ============================================================
// TaskBoardToggle — Button to toggle the task board
// ============================================================

export function TaskBoardToggle() {
  const toggleTaskBoard = useTaskStore((s) => s.toggleTaskBoard);
  const showTaskBoard = useTaskStore((s) => s.showTaskBoard);

  return (
    <button
      onClick={toggleTaskBoard}
      className={cn(
        "rounded p-1.5 transition-colors",
        showTaskBoard
          ? "bg-purple-500/20 text-purple-400"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      title="Toggle task board"
    >
      <LayoutGrid className="h-4 w-4" />
    </button>
  );
}
