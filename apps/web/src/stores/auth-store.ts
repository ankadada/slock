import { create } from "zustand";
import type { User } from "@slock/shared";
import * as api from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("slock_token"),
  isLoading: false,
  isAuthenticated: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await api.login({ username, password });
      localStorage.setItem("slock_token", token);
      set({ user, token, isAuthenticated: true, isLoading: false });
      connectSocket();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Login failed",
        isLoading: false,
      });
      throw err;
    }
  },

  register: async (username, email, password, inviteCode?) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await api.register({ username, email, password, inviteCode });
      localStorage.setItem("slock_token", token);
      set({ user, token, isAuthenticated: true, isLoading: false });
      connectSocket();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Registration failed",
        isLoading: false,
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("slock_token");
    disconnectSocket();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  loadUser: async () => {
    const token = get().token;
    if (!token) {
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const user = await api.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
      connectSocket();
    } catch {
      localStorage.removeItem("slock_token");
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
