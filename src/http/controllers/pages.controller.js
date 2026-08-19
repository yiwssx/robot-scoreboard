"use strict";

const path = require("node:path");

const PAGE_FILES = Object.freeze({
  control: "control.html",
  teamA: "team-a.html",
  teamB: "team-b.html",
  teams: "team-names.html",
});

function createPagesController({ publicDir }) {
  function send(pageKey) {
    return function sendPage(req, res) {
      res.sendFile(path.join(publicDir, PAGE_FILES[pageKey]));
    };
  }

  return {
    index(req, res) {
      res.redirect("/control");
    },
    control: send("control"),
    teamA: send("teamA"),
    teamB: send("teamB"),
    teams: send("teams"),
  };
}

module.exports = { createPagesController, PAGE_FILES };
