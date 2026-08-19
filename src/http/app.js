"use strict";

const express = require("express");
const { responseHeaders } = require("./middleware/response-headers");
const { createRouter } = require("./routes");

function createApp({ scoreboard, publicDir }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(responseHeaders);
  app.use(express.json({ limit: "16kb" }));
  app.use(createRouter({ scoreboard, publicDir }));
  app.use(express.static(publicDir, { index: false }));

  return app;
}

module.exports = { createApp };
