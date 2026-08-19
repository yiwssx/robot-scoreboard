"use strict";

const express = require("express");
const { createPagesController } = require("../controllers/pages.controller");

function createPagesRouter({ publicDir }) {
  const router = express.Router();
  const pages = createPagesController({ publicDir });

  router.get("/", pages.index);
  router.get("/control", pages.control);
  router.get("/team/a", pages.teamA);
  router.get("/team/b", pages.teamB);
  router.get("/teams", pages.teams);
  router.get("/status", pages.status);

  router.get("/control.html", (req, res) => res.redirect(308, "/control"));
  router.get("/team-a.html", (req, res) => res.redirect(308, "/team/a"));
  router.get("/team-b.html", (req, res) => res.redirect(308, "/team/b"));
  router.get("/team-names.html", (req, res) => res.redirect(308, "/teams"));
  router.get("/status.html", (req, res) => res.redirect(308, "/status"));

  return router;
}

module.exports = { createPagesRouter };
