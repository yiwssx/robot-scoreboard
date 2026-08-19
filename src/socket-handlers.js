"use strict";

const { registerSockets } = require("./sockets");

module.exports = {
  registerSockets,
  registerSocketHandlers: registerSockets,
};
