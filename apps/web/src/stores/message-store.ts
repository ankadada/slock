import { create } from "zustand";
import type { Message } from "@slock/shared";
import * as api from "@/lib/api";

interface MessageState {
  messagesByChannel: Record<string, Message[]>;
  streamingMessages: Record<string, string>; // messageId -> accumulated text
  isLoading: boolean;
  hasMore: Record<string, boolean>;
  cursors: Record<string, string | undefined>;
  threadMessages: Record<string, Message[]>; // parentId -> replies
  activeThreadId: string | null;

  fetchMessages: (channelId: string) => Promise<void>;
  fetchMoreMessages: (channelId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  deleteMessage: (messageId: string, channelId: string) => void;
  appendStreamChunk: (messageId: string, chunk: string) => void;
  finalizeStream: (messageId: string) => void;
  setActiveThread: (parentId: string | null) => void;
  fetchThreadMessages: (parentId: string) => Promise<void>;
  getChannelMessages: (channelId: string) => Message[];
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByChannel: {},
  streamingMessages: {},
  isLoading: false,
  hasMore: {},
  cursors: {},
  threadMessages: {},
  activeThreadId: null,

  fetchMessages: async (channelId) => {
    set({ isLoading: true });
    try {
      const result = await api.getMessages(channelId);
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: result.messages,
        },
        hasMore: { ...state.hasMore, [channelId]: result.hasMore },
        cursors: { ...state.cursors, [channelId]: result.nextCursor },
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  fetchMoreMessages: async (channelId) => {
    const cursor = get().cursors[channelId];
    if (!cursor || !get().hasMore[channelId]) return;

    try {
      const result = await api.getMessages(channelId, cursor);
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...result.messages, ...(state.messagesByChannel[channelId] || [])],
        },
        hasMore: { ...state.hasMore, [channelId]: result.hasMore },
        cursors: { ...state.cursors, [channelId]: result.nextCursor },
      }));
    } catch {
      // ignore
    }
  },

  addMessage: (message) => {
    set((state) => {
      const channelMessages = state.messagesByChannel[message.channelId] || [];
      const exists = channelMessages.find((m) => m.id === message.id);
      if (exists) return state;

      if (message.parentId) {
        const threadMsgs = state.threadMessages[message.parentId] || [];
        return {
          threadMessages: {
            ...state.threadMessages,
            [message.parentId]: [...threadMsgs, message],
          },
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [message.channelId]: [...channelMessages, message],
        },
      };
    });
  },

  updateMessage: (message) => {
    set((state) => {
      const channelMessages = state.messagesByChannel[message.channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [message.channelId]: channelMessages.map((m) =>
            m.id === message.id ? message : m
          ),
        },
      };
    });
  },

  deleteMessage: (messageId, channelId) => {
    set((state) => {
      const channelMessages = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: channelMessages.filter((m) => m.id !== messageId),
        },
      };
    });
  },

  appendStreamChunk: (messageId, chunk) => {
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [messageId]: (state.streamingMessages[messageId] || "") + chunk,
      },
    }));
  },

  finalizeStream: (messageId) => {
    set((state) => {
      const streamedContent = state.streamingMessages[messageId];
      const newStreaming = { ...state.streamingMessages };
      delete newStreaming[messageId];

      // If we have streamed content but no message yet in any channel,
      // keep it — the addMessage from agent:response/message:new will
      // arrive shortly and replace it. If it never arrives, we still
      // show the streamed text rather than losing it.
      if (!streamedContent) {
        return { streamingMessages: newStreaming };
      }

      // Check if a message with this ID already exists in any channel
      for (const channelMsgs of Object.values(state.messagesByChannel)) {
        if (channelMsgs.some((m) => m.id === messageId)) {
          return { streamingMessages: newStreaming };
        }
      }

      // No message found — nothing to do yet, addMessage will handle it
      return { streamingMessages: newStreaming };
    });
  },

  setActiveThread: (parentId) => {
    set({ activeThreadId: parentId });
  },

  fetchThreadMessages: async (parentId) => {
    try {
      const messages = await api.getThreadMessages(parentId);
      set((state) => ({
        threadMessages: {
          ...state.threadMessages,
          [parentId]: messages,
        },
      }));
    } catch {
      // ignore
    }
  },

  getChannelMessages: (channelId) => {
    return get().messagesByChannel[channelId] || [];
  },
}));
