"use strict";

function createDisabledObsControl() {
  return {
    async switchScene() {
      return { ok: false, code: "OBS_CONTROL_NOT_CONFIGURED" };
    },
    async refreshBrowserSource() {
      return { ok: false, code: "OBS_CONTROL_NOT_CONFIGURED" };
    },
    health() {
      return {
        transport: "obs-websocket",
        optional: true,
        configured: false,
        connected: false,
      };
    },
  };
}

function createBroadcastService({ textOutput, obsControl = createDisabledObsControl() }) {
  return {
    publish(snapshot, force = false) {
      textOutput.publish(snapshot, force);
    },
    flushAll() {
      return textOutput.flushAll();
    },
    health() {
      const text = textOutput.health();
      return {
        ...text,
        textOutput: text,
        obsControl: obsControl.health(),
      };
    },
    obsControl,
  };
}

module.exports = { createBroadcastService, createDisabledObsControl };
