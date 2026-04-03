import { create } from "zustand";
import type { Channel } from "@slock/shared";
import * as api from "@/lib/api";

interface ChannelState {
  channels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchChannels: () => Promise<void>;
  setActiveChannel: (id: string | null) => void;
  createChannel: (name: string, description?: string, type?: "public" | "private") => Promise<Channel>;
  addChannel: (channel: Channel) => void;
  updateChannel: (channel: Channel) => void;
  getActiveChannel: () => Channel | undefined;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  isLoading: false,
  error: null,

  fetchChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const channels = await api.getChannels();
      set({ channels, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch channels",
        isLoading: false,
      });
    }
  },

  setActiveChannel: (id) => {
    set({ activeChannelId: id });
  },

  createChannel: async (name, description, type = "public") => {
    const channel = await api.createChannel({ name, description, type });
    set((state) => ({ channels: [...state.channels, channel] }));
    return channel;
  },

  addChannel: (channel) => {
    set((state) => {
      const exists = state.channels.find((c) => c.id === channel.id);
      if (exists) return state;
      return { channels: [...state.channels, channel] };
    });
  },

  updateChannel: (channel) => {
    set((state) => ({
      channels: state.channels.map((c) => (c.id === channel.id ? channel : c)),
    }));
  },

  getActiveChannel: () => {
    const { channels, activeChannelId } = get();
    return channels.find((c) => c.id === activeChannelId);
  },
}));
