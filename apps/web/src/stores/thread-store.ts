import { create } from "zustand";
import type { Channel } from "@slock/shared";
import * as api from "@/lib/api";

interface ThreadState {
  threadsByChannel: Record<string, Channel[]>;
  activeThreadId: string | null;
  isLoading: boolean;

  fetchThreads: (channelId: string) => Promise<void>;
  setActiveThread: (threadId: string | null) => void;
  createThread: (
    channelId: string,
    name: string,
    sourceMessageId?: string,
    agentIds?: string[]
  ) => Promise<Channel>;
  addThread: (thread: Channel) => void;
  clearActiveThread: () => void;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threadsByChannel: {},
  activeThreadId: null,
  isLoading: false,

  fetchThreads: async (channelId) => {
    set({ isLoading: true });
    try {
      const threads = await api.getThreads(channelId);
      set((state) => ({
        threadsByChannel: {
          ...state.threadsByChannel,
          [channelId]: threads,
        },
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveThread: (threadId) => {
    set({ activeThreadId: threadId });
  },

  createThread: async (channelId, name, sourceMessageId, agentIds) => {
    const thread = await api.createThread(channelId, name, sourceMessageId, agentIds);
    set((state) => {
      const existing = state.threadsByChannel[channelId] || [];
      return {
        threadsByChannel: {
          ...state.threadsByChannel,
          [channelId]: [thread, ...existing],
        },
      };
    });
    return thread;
  },

  addThread: (thread) => {
    if (!thread.parentChannelId) return;
    set((state) => {
      const channelId = thread.parentChannelId!;
      const existing = state.threadsByChannel[channelId] || [];
      const alreadyExists = existing.find((t) => t.id === thread.id);
      if (alreadyExists) return state;
      return {
        threadsByChannel: {
          ...state.threadsByChannel,
          [channelId]: [thread, ...existing],
        },
      };
    });
  },

  clearActiveThread: () => {
    set({ activeThreadId: null });
  },
}));
