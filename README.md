# Robot Scoreboard — Offline Competition Edition

A scoreboard system for **offline / trusted-LAN robot competitions**. The central machine is the authoritative host for competition rules, timing, scoring, persistence, and Broadcast/OBS, while Team A/B devices are thin browser clients used only for score entry.

## Repository map

The repository is structured so the system boundaries are immediately visible:

```text
robot-scoreboard/
├─ server/          # central-machine system: competition, transport, storage, broadcast
├─ client/          # browser application source + static HTML/CSS/assets
├─ runtime/         # configuration + mutable field data + local OBS outputs
├─ tools/           # development / field operations / release packaging
├─ tests/           # automated tests + field/stress validation
├─ docs/            # architecture and field acceptance documentation
├─ dist/            # generated client/package output (not committed)
├─ package.json
└─ README.md
```

The key principle is that **source code, generated output, and runtime state remain separate**.

## Runtime topology

```text
TEAM A browser ─┐
                ├── trusted LAN ──► CENTRAL MACHINE
TEAM B browser ─┘                    ├─ Node.js / Express / Socket.IO
                                     ├─ authoritative competition state
Control / Setup / Status ──────────►├─ runtime/data persistence
                                     ├─ runtime/obs local text output
                                     ├─ read-only Browser Source overlay
                                     └─ OBS Studio
```

- OBS runs only on the central machine.
- Team A/B devices do not need OBS, Node.js, or npm.
- No login, token, cloud, or Internet dependency is required during field operation.
- Do not port-forward TCP 3000 to the Internet.

## Server

```text
server/
├─ main.js
├─ competition/
│  ├─ domain/        # rules / normalization / winner / time logic
│  ├─ runtime/       # authoritative mutable state + orchestration helpers
│  └─ use-cases/     # match / scoring / team / result operations
├─ broadcast/
│  ├─ broadcast-projector.js
│  ├─ broadcast-service.js
│  └─ outputs/text-file-output.js
├─ config/
├─ diagnostics/
├─ transport/
│  ├─ http/
│  └─ sockets/
└─ storage/
   ├─ fs/
   ├─ logging/
   └─ persistence/
```

The backend is the single source of truth for competition rules and winner/result logic.

## Client

The client is a Vite + TypeScript + Preact multi-page application:

```text
client/
├─ src/
│  ├─ apps/
│  │  ├─ control/
│  │  ├─ scoring/       # shared Team A/B scoring app
│  │  ├─ team-setup/
│  │  ├─ status/
│  │  └─ overlay/       # read-only OBS Browser Source
│  ├─ core/
│  ├─ features/
│  └─ shared/
├─ static/
│  ├─ pages/
│  ├─ css/
│  └─ assets/
├─ tsconfig.json
└─ vite.config.ts
```

Build output is written to `dist/client/`; the source tree contains no generated JavaScript bundles.

## Runtime

```text
runtime/
├─ config/competition-rules.json
├─ data/
│  ├─ team-names.json
│  ├─ match-results.json
│  ├─ live-match-state.json
│  └─ event-log.ndjson
└─ obs/
   ├─ score_a.txt
   ├─ score_b.txt
   ├─ time.txt
   ├─ status.txt
   └─ ...
```

`runtime/data` and `runtime/obs` contain mutable field state and are ignored by Git except for `.gitkeep`.

## Broadcast / OBS

```text
Authoritative state
       │
       ▼
Broadcast Projector
       │
       ▼
BroadcastState
   ┌───┴──────────────┐
   ▼                  ▼
Text files       /broadcast Socket.IO
   │                  │
   ▼                  ▼
runtime/obs      Browser Source overlay
   └────────► OBS Studio ◄──────┘
```

Text-file output remains the reliable local primary/fallback path and preserves changed-only writes, debounce, atomic replacement, and Windows retry behavior. OBS WebSocket control is an optional control-plane feature and is not a competition-critical dependency.

## URLs

- Control: `http://localhost:3000/control`
- Team A: `http://SERVER-IP:3000/team/a`
- Team B: `http://SERVER-IP:3000/team/b`
- Team setup: `http://localhost:3000/teams`
- Field status: `http://localhost:3000/status`
- OBS overlay: `http://127.0.0.1:3000/overlay/main`
- Health: `http://localhost:3000/healthz`
- Field status API: `http://localhost:3000/api/field-status`

Legacy `.html` URLs redirect to the canonical routes.

## Development / validation

```bash
npm ci
npm run build:client
npm run check
npm test
npm run stress:obs
npm audit --audit-level=high
```

- `npm run build:client` → `dist/client`
- `npm run check` → JavaScript syntax validation + strict TypeScript typecheck
- `npm test` → automated tests under `tests/`
- `npm run stress:obs` → 1,500-update OBS filesystem stress test

Dependency automation is restricted to **direct npm dependencies declared in `package.json`**. Changes to `package-lock.json` are allowed only when required by an approved direct dependency update; the lockfile must not be used as a separate channel for routine transitive dependency updates. GitHub Actions versions are maintained manually and must pass normal CI. See `docs/DEPENDENCY-AUTOMATION.md`.

## Tools

```text
tools/
├─ dev/check-js.js
├─ field/
│  ├─ field-check.ps1
│  ├─ backup-scoreboard.ps1
│  └─ restore-scoreboard.ps1
└─ release/
   ├─ build-offline-windows.ps1
   └─ verify-offline-package.ps1
```

Backup/restore operates on `runtime/data`, `runtime/obs`, and `runtime/config`. Restore refuses to proceed when a managed scoreboard process is running or when a listener is detected on the configured port. Both `PORT` and `-Port` are supported; the tooling does not hard-code port 3000 only.

## Offline Windows package

Build with:

```powershell
npm ci
npm run build:offline:windows
```

The generated package contains `server/`, `dist/client/`, production dependencies, `runtime/config/`, field tools, and `bin/node.exe`. The field machine does not need to run `npm install`.

`START-SCOREBOARD.cmd` writes a managed PID record to `runtime/scoreboard.pid.json`. `STOP-SCOREBOARD.cmd` stops only the process referenced by that record and verifies that it is the packaged Scoreboard process, so it will not terminate an unrelated application merely because it uses TCP 3000.

The release workflow uses the same critical validation gates as field CI: build/check/tests, OBS stress, live field check, backup/restore drill, audit, package build, and staged-package runtime verification. For tag-based releases, the tag must match the `package.json` version (`v<version>`) so artifact version metadata cannot diverge.

## Field acceptance

CI does not replace physical field acceptance. Before declaring a release **Field Approved**, test the actual central machine + OBS + Team A/B devices + LAN + audio + power recovery using `docs/FIELD-ACCEPTANCE-CHECKLIST.md`.

For Client/Broadcast details, see `docs/CLIENT-BROADCAST-ARCHITECTURE.md`.

## Project purpose, origin, and license

This version of Robot Scoreboard is re-engineered primarily for **education, learning, and student competitions**, especially robot competitions and related activities. It may also be studied, modified, redistributed, and adapted for other uses, including commercial use, subject to the GNU GPL.

- **Original project author:** Buncha Sawaddee
- **Original project:** https://github.com/foAddz19/robot-scoreboard
- **Re-engineered and maintained by:** Supharoek Sudadet
- **Re-engineered repository:** https://github.com/yiwssx/robot-scoreboard

The original project metadata in `package.json` identified its license as ISC. This re-engineered edition is distributed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)** while preserving the original provenance and license metadata in `NOTICE`.

Commercial use is **not prohibited** by the GPL, but it is not the primary purpose of this project. Anyone distributing the software or modified versions must comply with the applicable GPL requirements.

See the full license text in [LICENSE](LICENSE) and provenance details in [NOTICE](NOTICE).
