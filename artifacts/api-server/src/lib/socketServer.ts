import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { logger } from "./logger.js";
import { setupAdminSocket } from "./adminSocket.js";
import { setIo } from "./ioInstance.js";

export function setupSockets(httpServer: HttpServer): void {
  const io = new Server(httpServer, {
    path: "/api/socket.io/",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // userId → socketId for presence tracking
  const online = new Map<string, string>();

  /*
   * SINGLE connection handler — previously this file had two `io.on("connection")`
   * handlers which fires both for every connect (works but doubles the
   * setup cost per socket). Merged into one to keep memory + duplicate-
   * listener surface minimal.
   *
   * Stale-socket cleanup is handled natively by socket.io's ping/pong
   * (default: pingInterval 25s, pingTimeout 20s). On a missed pong the
   * server fires `disconnect` which cleans the `online` map below.
   */
  io.on("connection", (socket) => {
    logger.debug({ id: socket.id }, "Socket connected");

    socket.on("user_online", (userId: string) => {
      if (typeof userId !== "string" || !userId) return;
      online.set(userId, socket.id);
      socket.broadcast.emit("user_online", userId);
    });

    socket.on("typing", (data: { chatId: string; userId: string }) => {
      if (!data || typeof data !== "object") return;
      socket.broadcast.emit("typing", data);
    });

    socket.on("stop_typing", (data: { chatId: string; userId: string }) => {
      if (!data || typeof data !== "object") return;
      socket.broadcast.emit("stop_typing", data);
    });

    /* Render job progress rooms — client joins "render:{jobId}".
     * Validated to prevent malformed payloads from creating empty rooms.
     * socket.io's adapter auto-cleans empty rooms after the last leaver,
     * so no manual GC is needed. */
    socket.on("join_render", (jobId: unknown) => {
      if (typeof jobId !== "string") return;
      const trimmed = jobId.trim();
      if (!trimmed || trimmed.length > 64) return;
      socket.join(`render:${trimmed}`);
      logger.debug({ socketId: socket.id, jobId: trimmed }, "Socket joined render room");
    });
    socket.on("leave_render", (jobId: unknown) => {
      if (typeof jobId !== "string") return;
      socket.leave(`render:${jobId.trim()}`);
    });

    socket.on("disconnect", (reason) => {
      for (const [uid, sid] of online.entries()) {
        if (sid === socket.id) {
          online.delete(uid);
          // Note: `user_offline` has no current frontend listener — kept
          // for future presence UI. Cheap to emit. If we ever need to
          // drop this it's safe to remove with no client impact.
          socket.broadcast.emit("user_offline", uid);
          break;
        }
      }
      logger.debug({ id: socket.id, reason }, "Socket disconnected");
    });
  });

  /* Admin fraud intelligence namespace */
  setupAdminSocket(io);

  /* Register io singleton for render worker */
  setIo(io);

  logger.info("Socket.IO attached at /api/socket.io/");
}
