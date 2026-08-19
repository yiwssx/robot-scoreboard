# Robot Scoreboard — Re-engineered

Realtime **offline / local-LAN** scoreboard for **VEC Service Intelligence Robot** using Node.js, Express, Socket.IO and OBS text sources.

## Design assumptions

This application is designed to run **without Internet access** on a trusted competition LAN. It intentionally has no login, token, cookie-based authentication or cloud dependency.

The network is the security boundary:

- use a dedicated router / access point or isolated competition LAN;
- connect only referee, control, display and OBS devices that belong to the event;
- do not port-forward TCP `3000` to the Internet;
- do not expose the scoreboard server through a public reverse proxy.

## What changed in v2

- Monotonic server timer: elapsed time is calculated from `process.hrtime.bigint()` instead of assuming every `setInterval(1000)` tick is exactly one second.
- Server-side scoring rules: browsers can no longer submit arbitrary score values or redefine mission points.
- No authentication layer: the original simple offline-LAN operating model is preserved.
- Runtime JSON moved to `data/`; OBS output remains in `obs/`.
- Debounced asynchronous/atomic persistence; OBS files are rewritten only when their value changes.
- Runtime files and `node_modules/` are ignored by Git.
- Server responsibilities are separated into domain, scoreboard, persistence and Socket.IO modules.
- Automated domain tests and GitHub Actions CI.
- `/healthz` endpoint for local health monitoring.

## Requirements

- Node.js 20 or newer
- npm

## Install and run

```bash
npm ci
npm start
```

The server listens on all local interfaces by default (`0.0.0.0:3000`).

On the server itself:

- `http://localhost:3000/control.html`
- `http://localhost:3000/team-a.html`
- `http://localhost:3000/team-b.html`
- `http://localhost:3000/team-names.html`

From another device on the same LAN, replace `localhost` with the scoreboard computer's LAN IP, for example:

```text
http://192.168.1.10:3000/team-a.html
```

## Optional environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port, default `3000` |
| `HOST` | Bind address, default `0.0.0.0` |
| `SCOREBOARD_DATA_DIR` | Override persistent JSON directory |
| `SCOREBOARD_OBS_DIR` | Override OBS output directory |

No access token variables are required.

## Runtime files

Persistent state is stored under `data/`:

- `data/team-names.json`
- `data/match-results.json`
- `data/live-match-state.json`

OBS text sources are generated under `obs/`, including scores, timer, mission shots, status, team names and school names.

The server can read legacy JSON files from `obs/` when the new `data/` copy does not exist, which provides a migration path for older installations.

Before switching an existing competition machine to this branch, back up the current `obs/` directory once because runtime files are intentionally no longer tracked by Git.

## Scoring integrity

Generic score adjustments are restricted by the server to:

- `+10`
- `+20`
- `-10`
- `-20`

Mission points are also defined by the server rather than trusted from the browser:

- Mission 1: 10 points
- Mission 2: 20 points
- Mission 3: 20 points
- Mission 4: 20 points

The winner is determined by:

1. higher score;
2. faster final shot when scores are tied;
3. lower robot weight when score and shot time are tied;
4. otherwise draw.

## Repository structure

```text
server.js                 HTTP/Socket.IO bootstrap
src/domain.js             pure scoring/timer/winner rules
src/scoreboard.js         live match state and competition operations
src/persistence.js        JSON + OBS persistence
src/socket-handlers.js    backward-compatible Socket.IO event handlers
public/                   existing control/display pages
data/                     runtime persistent JSON (not tracked)
obs/                      OBS text output (not tracked)
```

## Validation

```bash
npm run check
npm test
```

CI runs syntax checks, unit tests and `npm audit --audit-level=high` on Node.js 20 and 22.
