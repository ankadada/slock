import { create } from "zustand";
import type { AgentDefinition } from "@slock/shared";
import * as api from "@/lib/api";

interface AgentState {
  agents: AgentDefinition[];
  isLoading: boolean;
  error: string | null;
  typingAgents: Record<string, string[]>; // channelId -> agentIds

  fetchAgents: () => Promise<void>;
  createAgent: (payload: Parameters<typeof api.createAgent>[0]) => Promise<AgentDefinition>;
  updateAgent: (id: string, payload: Parameters<typeof api.updateAgent>[1]) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  setAgentTyping: (agentId: string, channelId: string) => void;
  clearAgentTyping: (agentId: string, channelId: string) => void;
  getAgent: (id: string) => AgentDefinition | undefined;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  isLoading: false,
  error: null,
  typingAgents: {},

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const agents = await api.getAgents();
      set({ agents, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch agents",
        isLoading: false,
      });
    }
  },

  createAgent: async (payload) => {
    const agent = await api.createAgent(payload);
    set((state) => ({ agents: [...state.agents, agent] }));
    return agent;
  },

  updateAgent: async (id, payload) => {
    const agent = await api.updateAgent(id, payload);
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? agent : a)),
    }));
  },

  deleteAgent: async (id) => {
    await api.deleteAgent(id);
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
    }));
  },

  setAgentTyping: (agentId, channelId) => {
    set((state) => {
      const current = state.typingAgents[channelId] || [];
      if (current.includes(agentId)) return state;
      return {
        typingAgents: {
          ...state.typingAgents,
          [channelId]: [...current, agentId],
        },
      };
    });
  },

  clearAgentTyping: (agentId, channelId) => {
    set((state) => {
      const current = state.typingAgents[channelId] || [];
      return {
        typingAgents: {
          ...state.typingAgents,
          [channelId]: current.filter((id) => id !== agentId),
        },
      };
    });
  },

  getAgent: (id) => {
    return get().agents.find((a) => a.id === id);
  },
}));
