# Client & Broadcast Architecture

## Deployment boundary

The scoreboard is one offline modular monolith hosted on the central Windows machine. Team A and Team B are thin browser clients over the trusted field LAN. OBS Studio exists only on the central machine.

```text
Team A Browser ─┐
                ├── LAN ──► Central Node.js Server ── local filesystem ──► OBS Studio
Team B Browser ─┘                       │
                                       └── localhost /broadcast ──► OBS Browser Source
```

A field client failure must not stop the authoritative match state, timer, persistence, Control UI, or local OBS outputs.

## Frontend boundary

The browser applications are a build-time Vite + TypeScript + Preact MPA. Runtime assets are static bundles served by Express.

- `control`: operator match control, result review, history
- `team`: one shared Team A/B scoring application selected by `data-team`
- `teams`: team administration and match selection
- `status`: central-machine field diagnostics
- `overlay-main`: read-only broadcast presentation for OBS Browser Source

All operator/field applications use one centralized realtime client/store per page. UI components never create Socket.IO connections directly.

## Realtime boundary

Default namespace `/` keeps the established competition event names. New clients declare an operational role in Socket.IO auth metadata, and the server registers only the command handlers that role needs:

- `control`: match controls and result review/correction
- `team-a`: scoring handlers restricted to Team A payloads
- `team-b`: scoring handlers restricted to Team B payloads
- `teams`: team administration and result deletion
- `status`: no command handlers

Legacy clients without role metadata retain the historical command surface for migration compatibility. Role metadata reduces accidental command exposure but is not authentication; the system remains designed for a trusted field LAN.

The `/broadcast` namespace is intentionally one-way at the application level:

```text
server -> broadcast:update -> overlay
```

No match, scoring, team-management, reset, or result handlers are registered on `/broadcast`.

## Authoritative-state rule

Competition rules live on the server. The client must not derive authoritative outcomes such as the winner from score/shot/weight values. Result DTOs already contain server-derived `winner` and `winnerName`.

## Broadcast projection

`src/broadcast/broadcast-projector.js` maps the internal update DTO to a restricted `BroadcastState` containing only presentation data:

- match status/time
- Team A/B name, school, score, shot and mission times
- display visibility
- current result winner/lock state

Internal team lists, history arrays and operator-only state are not exposed to the overlay.

## Output adapters

`TextFileBroadcastOutput` is a central-machine infrastructure adapter. It is the only layer that knows the legacy OBS filenames.

The application layer publishes `BroadcastState`; the adapter maps it to the existing 18 text outputs and uses an independent atomic write queue with changed-only suppression and Windows contention retries.

This preserves compatibility with existing OBS Text Sources while allowing Browser Source overlays to coexist.

`broadcast-service.js` is the broadcast composition boundary. Text-file output is required. An OBS control port is present but disabled by default and reports `OBS_CONTROL_NOT_CONFIGURED`; a future OBS WebSocket adapter can implement scene/source control without changing application or competition logic and without making OBS WebSocket a field dependency.

`force-sync` refreshes operator clients, persists local text output and emits a fresh `broadcast:update` snapshot to Browser Source clients.

## Failure model

Required for field operation:

- central server
- authoritative state/persistence
- local OBS output directory
- compiled frontend bundles

Optional/non-authoritative:

- Team A/B currently connected (they can reconnect/reload)
- Browser Source overlay (legacy text output remains available)
- OBS WebSocket control-plane integration

The architecture deliberately does not make match operation dependent on OBS WebSocket.

## Build/runtime separation

Vite, TypeScript and Preact are development/build dependencies. The Windows package is built first and then pruned to production Node dependencies; Preact is embedded in the generated browser bundle.

The field machine therefore starts with bundled `public/app/*.js`, production server dependencies and bundled `node.exe` without requiring npm, Vite or Internet access at runtime.
