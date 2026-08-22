# Client & Broadcast Architecture

## Repository boundaries

The repository mirrors the deployed system rather than implementation-era layers:

```text
server/   central-machine application
client/   browser application source and static assets
runtime/  field configuration, persistence and OBS output
tools/    development, field and release operations
tests/    automated validation
dist/     generated build output only
```

`server/` and `client/` are source. `dist/` is generated. `runtime/` is field state/configuration. This prevents source-of-truth ambiguity.

## Deployment boundary

The scoreboard is one offline modular monolith hosted on the central Windows machine. Team A and Team B are thin browser clients over the trusted field LAN. OBS Studio exists only on the central machine.

```text
Team A Browser ─┐
                ├── LAN ──► Central Node.js Server ── local filesystem ──► OBS Studio
Team B Browser ─┘                       │
                                       └── localhost /broadcast ──► OBS Browser Source
```

A field-client failure must not stop authoritative match state, timer, persistence, Control UI, or local OBS output.

## Server boundary

Competition behavior lives under `server/competition/`:

- `domain/`: pure competition rules, normalization, time and result helpers
- `runtime/`: authoritative state and state projection/orchestration helpers
- `use-cases/`: match, scoring, team and result operations

External mechanisms are explicit siblings:

- `server/transport/http/`
- `server/transport/sockets/`
- `server/storage/`
- `server/broadcast/`
- `server/diagnostics/`

The composition root is `server/main.js`.

## Client boundary

The browser applications are a build-time Vite + TypeScript + Preact MPA under `client/`:

- `control`: operator match control, result review, history
- `scoring`: one shared Team A/B scoring application selected by `data-team`
- `team-setup`: team administration and match selection
- `status`: central-machine field diagnostics
- `overlay`: read-only broadcast presentation for OBS Browser Source

HTML/CSS/assets live under `client/static/`. Vite copies them and emits compiled bundles to `dist/client/`. There is no committed legacy `public/js` tree and no generated bundle inside the source tree.

All operator/field applications use one centralized realtime client/store per page. UI components never create Socket.IO connections directly.

## Realtime boundary

Default namespace `/` keeps the established competition event names. Clients declare an operational role and the server registers only the command handlers that role needs:

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

No match, scoring, team-management, reset or result handlers are registered on `/broadcast`.

## Authoritative-state rule

Competition rules live on the server. The client must not derive authoritative outcomes such as the winner from score/shot/weight values. Result DTOs contain server-derived `winner` and `winnerName`.

## Broadcast projection

`server/broadcast/broadcast-projector.js` maps the internal update DTO to a restricted `BroadcastState` containing only presentation data:

- match status/time
- Team A/B name, school, score, shot and mission times
- display visibility
- current result winner/lock state

Internal team lists, history arrays and operator-only state are not exposed to the overlay.

## Output adapters

`server/broadcast/outputs/text-file-output.js` is the only layer that knows legacy OBS filenames. It writes to `runtime/obs/` on the central machine using an independent atomic-write queue with changed-only suppression and Windows contention retries.

`server/broadcast/broadcast-service.js` is the broadcast composition boundary. Text-file output is required. OBS WebSocket control is optional and remains outside competition-critical operation.

`force-sync` refreshes operator clients, persists local text output and emits a fresh `broadcast:update` snapshot to Browser Source clients.

## Runtime boundary

```text
runtime/
├─ config/   committed competition configuration
├─ data/     mutable persistence and event log
└─ obs/      mutable local OBS text output
```

`runtime/data` and `runtime/obs` contents are not source code and are ignored by Git.

## Failure model

Required for field operation:

- central server
- authoritative state/persistence
- local OBS output directory
- compiled `dist/client` assets

Optional/non-authoritative:

- Team A/B currently connected (they can reconnect/reload)
- Browser Source overlay (text output remains available)
- OBS WebSocket control-plane integration

The architecture deliberately does not make match operation dependent on OBS WebSocket.

## Build/runtime separation

Vite, TypeScript and Preact are development/build dependencies. Build output is generated under `dist/client/`, then the Windows release package is staged and pruned to production Node dependencies. Preact is embedded in browser bundles.

The field machine starts with `server/`, `dist/client/`, `runtime/`, production dependencies and `bin/node.exe` without requiring npm, Vite or Internet access at runtime.
