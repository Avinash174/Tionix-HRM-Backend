const { Server } = require("socket.io");

let io;

const initSockets = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    socket.on("join-admin", () => {
      socket.join("admin");
    });

    socket.on("join-admin-office", (locationId) => {
      if (locationId != null && locationId !== "") {
        socket.join(`office-${locationId}`);
      }
    });

    socket.on("leave-admin-office", (locationId) => {
      if (locationId != null && locationId !== "") {
        socket.leave(`office-${locationId}`);
      }
    });
  });

  return io;
};

const emitEvent = (event, payload) => {
  if (!io) return;
  io.to("admin").emit(event, payload);
};

const emitToOffice = (locationId, event, payload) => {
  if (!io || locationId == null) return;
  io.to(`office-${locationId}`).emit(event, payload);
};

const getIo = () => io;

module.exports = {
  initSockets,
  emitEvent,
  emitToOffice,
  getIo,
};
