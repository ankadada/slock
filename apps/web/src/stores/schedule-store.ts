import { create } from "zustand";
import * as api from "@/lib/api";
import type { AgentSchedule } from "@/lib/api";

interface ScheduleState {
  schedules: AgentSchedule[];
  isLoading: boolean;
  error: string | null;

  fetchSchedules: (channelId?: string) => Promise<void>;
  createSchedule: (data: api.CreateScheduleData) => Promise<void>;
  updateSchedule: (id: string, updates: Partial<AgentSchedule>) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  runScheduleNow: (id: string) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedules: [],
  isLoading: false,
  error: null,

  fetchSchedules: async (channelId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const schedules = await api.getSchedules(channelId);
      set({ schedules, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch schedules",
        isLoading: false,
      });
    }
  },

  createSchedule: async (data) => {
    try {
      const schedule = await api.createScheduleApi(data);
      set((state) => ({ schedules: [...state.schedules, schedule] }));
    } catch (err) {
      throw err;
    }
  },

  updateSchedule: async (id, updates) => {
    try {
      const schedule = await api.updateScheduleApi(id, updates);
      set((state) => ({
        schedules: state.schedules.map((s) => (s.id === id ? schedule : s)),
      }));
    } catch (err) {
      throw err;
    }
  },

  deleteSchedule: async (id) => {
    try {
      await api.deleteScheduleApi(id);
      set((state) => ({
        schedules: state.schedules.filter((s) => s.id !== id),
      }));
    } catch (err) {
      throw err;
    }
  },

  runScheduleNow: async (id) => {
    try {
      await api.runScheduleNowApi(id);
    } catch (err) {
      throw err;
    }
  },
}));
