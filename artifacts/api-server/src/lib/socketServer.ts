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

  io.on("connection", (socket) => {
    logger.debug({ id: socket.id }, "Socket connected");

    socket.on("user_online", (userId: string) => {
      if (!userId) return;
      online.set(userId, socket.id);
      socket.broadcast.emit("user_online", userId);
    });

    socket.on("typing", (data: { chatId: string; userId: string }) => {
      socket.broadcast.emit("typing", data);
    });

    socket.on("stop_typing", (data: { chatId: string; userId: string }) => {
      socket.broadcast.emit("stop_typing", data);
    });

    socket.on("disconnect", () => {
      for (const [uid, sid] of online.entries()) {
        if (sid === socket.id) {
          online.delete(uid);
          socket.broadcast.emit("user_offline", uid);
          break;
        }
      }
      logger.debug({ id: socket.id }, "Socket disconnected");
    });
  });

  /* Render job progress rooms — client joins "render:{jobId}" */
  io.on("connection", (socket) => {
    socket.on("join_render", (jobId: string) => {
      if (typeof jobId === "string" && jobId.length > 0) {
        socket.join(`render:${jobId}`);
        logger.debug({ socketId: socket.id, jobId }, "Socket joined render room");
      }
    });
    socket.on("leave_render", (jobId: string) => {
      socket.leave(`render:${jobId}`);
    });
  });

  /* Admin fraud intelligence namespace */
  setupAdminSocket(io);

  /* Register io singleton for render worker */
  setIo(io);

  logger.info("Socket.IO attached at /api/socket.io/");
}
