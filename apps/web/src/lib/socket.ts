import { io, type Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@slock/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    const token = localStorage.getItem("slock_token");
    socket = io("/", {
      auth: { token },
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
    // Register error handler once at creation time
    socket.on("connect_error", (err) => {
      console.error("[socket] connection error:", err.message);
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    const token = localStorage.getItem("slock_token");
    s.auth = { token };
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
