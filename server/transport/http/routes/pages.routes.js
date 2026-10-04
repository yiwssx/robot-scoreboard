"use strict";

const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { createPagesController } = require("../controllers/pages.controller");

const pageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function createPagesRouter({ publicDir }) {
  const router = express.Router();
  const pages = createPagesController({ publicDir });

  router.get("/", pages.index);
  router.get("/control", pageRateLimiter, pages.control);
  router.get("/team/a", pageRateLimiter, pages.teamA);
  router.get("/team/b", pageRateLimiter, pages.teamB);
  router.get("/teams", pageRateLimiter, pages.teams);
  router.get("/status", pageRateLimiter, pages.status);
  router.get("/overlay/main", pageRateLimiter, pages.overlayMain);

  router.get("/control.html", (req, res) => res.redirect(308, "/control"));
  router.get("/team-a.html", (req, res) => res.redirect(308, "/team/a"));
  router.get("/team-b.html", (req, res) => res.redirect(308, "/team/b"));
  router.get("/team-names.html", (req, res) => res.redirect(308, "/teams"));
  router.get("/status.html", (req, res) => res.redirect(308, "/status"));
  router.get("/overlay", (req, res) => res.redirect(308, "/overlay/main"));

  return router;
}

module.exports = { createPagesRouter };
