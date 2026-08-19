"use strict";

const express = require("express");
const { createHealthRouter } = require("./health.routes");
const { createPagesRouter } = require("./pages.routes");
const { createFieldStatusRouter } = require("./field-status.routes");

function createRouter({ scoreboard, publicDir, fieldReadiness }) {
  const router = express.Router();
  router.use(createHealthRouter({ scoreboard }));
  if (fieldReadiness) router.use(createFieldStatusRouter({ fieldReadiness, scoreboard }));
  router.use(createPagesRouter({ publicDir }));
  return router;
}

module.exports = { createRouter };
