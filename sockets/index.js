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
  });

  return io;
};

const emitEvent = (event, payload) => {
  if (!io) return;
  io.to("admin").emit(event, payload);
};

const getIo = () => io;

module.exports = {
  initSockets,
  emitEvent,
  getIo,
};
