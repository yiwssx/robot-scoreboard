"use strict";

function socketContext(socket) {
  return {
    socketId: socket.id,
    ip: socket.handshake && socket.handshake.address,
    page: socket.handshake && socket.handshake.headers && socket.handshake.headers.referer,
  };
}

module.exports = { socketContext };
