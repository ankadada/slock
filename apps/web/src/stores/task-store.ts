import { create } from "zustand";

// ============================================================
// Task types (mirroring server-side AgentTask)
// ============================================================

export interface AgentTask {
  id: string;
  channelId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status: "pending" | "assigned" | "in_progress" | "completed" | "failed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  managerAgentId: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
  subTasks?: AgentTask[];
}

// ============================================================
// API helpers
// ============================================================

const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("slock_token");
}

async function fetchTasksAPI(channelId: string): Promise<AgentTask[]> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/tasks/${channelId}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const json = await res.json();
  return json.data || [];
}

// ============================================================
// Zustand store
// ============================================================

interface TaskState {
  tasksByChannel: Record<string, AgentTask[]>;
  isLoading: boolean;
  showTaskBoard: boolean;

  fetchTasks: (channelId: string) => Promise<void>;
  addTask: (task: AgentTask) => void;
  updateTask: (task: AgentTask) => void;
  setShowTaskBoard: (show: boolean) => void;
  toggleTaskBoard: () => void;
  getChannelTasks: (channelId: string) => AgentTask[];
}

const EMPTY_TASKS: AgentTask[] = [];

export const useTaskStore = create<TaskState>((set, get) => ({
  tasksByChannel: {},
  isLoading: false,
  showTaskBoard: false,

  fetchTasks: async (channelId: string) => {
    set({ isLoading: true });
    try {
      const tasks = await fetchTasksAPI(channelId);
      set((state) => ({
        tasksByChannel: {
          ...state.tasksByChannel,
          [channelId]: tasks,
        },
        isLoading: false,
      }));
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      set({ isLoading: false });
    }
  },

  addTask: (task: AgentTask) => {
    set((state) => {
      const channelTasks = state.tasksByChannel[task.channelId] || [];

      // If this is a sub-task, find the parent and add it
      if (task.parentTaskId) {
        const updatedTasks = channelTasks.map((parent) => {
          if (parent.id === task.parentTaskId) {
            return {
              ...parent,
              subTasks: [...(parent.subTasks || []), task],
            };
          }
          return parent;
        });
        return {
          tasksByChannel: {
            ...state.tasksByChannel,
            [task.channelId]: updatedTasks,
          },
        };
      }

      // Otherwise add as a parent task
      return {
        tasksByChannel: {
          ...state.tasksByChannel,
          [task.channelId]: [...channelTasks, task],
        },
      };
    });
  },

  updateTask: (task: AgentTask) => {
    set((state) => {
      const channelTasks = state.tasksByChannel[task.channelId] || [];

      const updatedTasks = channelTasks.map((parent) => {
        // Check if this is the parent task being updated
        if (parent.id === task.id) {
          return { ...parent, ...task, subTasks: parent.subTasks };
        }

        // Check sub-tasks
        if (parent.subTasks) {
          const updatedSubs = parent.subTasks.map((sub) =>
            sub.id === task.id ? { ...sub, ...task } : sub
          );
          return { ...parent, subTasks: updatedSubs };
        }

        return parent;
      });

      return {
        tasksByChannel: {
          ...state.tasksByChannel,
          [task.channelId]: updatedTasks,
        },
      };
    });
  },

  setShowTaskBoard: (show: boolean) => set({ showTaskBoard: show }),
  toggleTaskBoard: () => set((state) => ({ showTaskBoard: !state.showTaskBoard })),

  getChannelTasks: (channelId: string) => {
    return get().tasksByChannel[channelId] || EMPTY_TASKS;
  },
}));
