"use strict";

const express = require("express");
const { createFieldStatusController } = require("../controllers/field-status.controller");

function createFieldStatusRouter({ fieldReadiness, scoreboard }) {
  const router = express.Router();
  router.get("/api/field-status", createFieldStatusController({ fieldReadiness, scoreboard }));
  return router;
}

module.exports = { createFieldStatusRouter };
