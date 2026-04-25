import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import { logger } from "./lib/logger";

interface RoomState {
  hostId: string;
  playing: boolean;
  currentTime: number;
  movieId: number;
  users: { id: string; profileName: string; avatar: string }[];
}

export function setupSocketIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  const rooms = new Map<string, RoomState>();

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "User connected");

    socket.on("join-room", ({ roomId, profile, movieId, isHost }) => {
      socket.join(roomId);

      let room = rooms.get(roomId);
      if (!room) {
        room = {
          hostId: isHost ? socket.id : "",
          playing: false,
          currentTime: 0,
          movieId,
          users: [],
        };
        rooms.set(roomId, room);
      }

      if (isHost && !room.hostId) {
        room.hostId = socket.id;
      }

      const userExists = room.users.find((u) => u.profileName === profile.name);
      if (!userExists) {
        room.users.push({
          id: socket.id,
          profileName: profile.name,
          avatar: profile.avatar_url,
        });
      }

      io.to(roomId).emit("room-update", room);
    });

    socket.on("sync-playback", ({ roomId, playing, currentTime }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        room.playing = playing;
        room.currentTime = currentTime;
        socket.to(roomId).emit("playback-update", { playing, currentTime });
      }
    });

    socket.on("send-emote", ({ roomId, emote, profileName }) => {
      io.to(roomId).emit("receive-emote", { emote, profileName, id: Math.random() });
    });

    socket.on("disconnect", () => {
      rooms.forEach((room, roomId) => {
        const userIndex = room.users.findIndex((u) => u.id === socket.id);
        if (userIndex !== -1) {
          room.users.splice(userIndex, 1);
          if (room.hostId === socket.id) {
            room.hostId = room.users[0]?.id || "";
          }
          if (room.users.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit("room-update", room);
          }
        }
      });
    });
  });

  return io;
}
