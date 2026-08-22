"use strict";

const express = require("express");
const { createHealthController } = require("../controllers/health.controller");

function createHealthRouter({ scoreboard }) {
  const router = express.Router();
  router.get("/healthz", createHealthController({ scoreboard }));
  return router;
}

module.exports = { createHealthRouter };
