"use strict";

const express = require("express");
const { createHealthRouter } = require("./health.routes");
const { createPagesRouter } = require("./pages.routes");

function createRouter({ scoreboard, publicDir }) {
  const router = express.Router();
  router.use(createHealthRouter({ scoreboard }));
  router.use(createPagesRouter({ publicDir }));
  return router;
}

module.exports = { createRouter };
