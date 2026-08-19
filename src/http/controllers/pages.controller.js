"use strict";

const path = require("node:path");

const PAGE_FILES = Object.freeze({
  control: path.join("pages", "control.html"),
  teamA: path.join("pages", "team-a.html"),
  teamB: path.join("pages", "team-b.html"),
  teams: path.join("pages", "team-names.html"),
  status: path.join("pages", "status.html"),
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
    status: send("status"),
  };
}

module.exports = { createPagesController, PAGE_FILES };
