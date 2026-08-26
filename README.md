# Robot Scoreboard — Offline Competition Edition

ระบบ Scoreboard สำหรับการแข่งขันหุ่นยนต์แบบ **Offline / Trusted LAN** โดยเครื่องกลางเป็น authoritative host สำหรับกติกา เวลา คะแนน persistence และ Broadcast/OBS ส่วน Team A/B เป็น thin browser clients สำหรับบันทึกคะแนนเท่านั้น

## Repository map

โครงสร้าง repository ตั้งใจให้เปิดแล้วเห็น boundary ของระบบทันที:

```text
robot-scoreboard/
├─ server/          # ระบบเครื่องกลาง: competition, transport, storage, broadcast
├─ client/          # source ของ browser apps + static HTML/CSS/assets
├─ runtime/         # config + mutable field data + local OBS outputs
├─ tools/           # dev / field operations / release packaging
├─ tests/           # automated tests + field/stress validation
├─ docs/            # architecture และ field acceptance
├─ dist/            # generated client/package output (ไม่ commit)
├─ package.json
└─ README.md
```

หลักการสำคัญคือ **source, generated output และ runtime state ไม่ปนกัน**.

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

- OBS อยู่ที่เครื่องกลางเท่านั้น
- Team A/B ไม่ต้องมี OBS, Node.js หรือ npm
- ไม่มี login/token/cloud/Internet dependency ตอนใช้งานสนาม
- ห้าม port-forward TCP 3000 ออก Internet

## Server

```text
server/
├─ main.js
├─ competition/
│  ├─ domain/        # กติกา/normalization/winner/time logic
│  ├─ runtime/       # authoritative mutable state + orchestration helpers
│  └─ use-cases/     # match/scoring/team/result operations
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

Backend เป็น single source of truth สำหรับ competition rules และ winner/result logic.

## Client

Client เป็น Vite + TypeScript + Preact Multi-Page Application:

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

Build output ไปที่ `dist/client/`; source tree ไม่มี generated JavaScript ปะปนอยู่.

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

`runtime/data` และ `runtime/obs` เป็น mutable field state และถูก ignore จาก Git ยกเว้น `.gitkeep`.

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

Text-file output ยังคงเป็น reliable local primary/fallback path และรักษา changed-only writes, debounce, atomic replace และ Windows retry. OBS WebSocket control เป็น optional control-plane และไม่ใช่ dependency ของการแข่งขัน.

## URLs

- Control: `http://localhost:3000/control`
- Team A: `http://IP-เครื่องกลาง:3000/team/a`
- Team B: `http://IP-เครื่องกลาง:3000/team/b`
- Team setup: `http://localhost:3000/teams`
- Field status: `http://localhost:3000/status`
- OBS overlay: `http://127.0.0.1:3000/overlay/main`
- Health: `http://localhost:3000/healthz`
- Field status API: `http://localhost:3000/api/field-status`

Legacy `.html` URLs redirect ไป canonical routes.

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
- `npm run check` → JavaScript syntax + strict TypeScript typecheck
- `npm test` → automated tests ใน `tests/`
- `npm run stress:obs` → 1,500-update OBS filesystem stress

Dependency automation จำกัดเฉพาะ **direct npm dependencies ที่ประกาศใน `package.json`** เท่านั้น. การเปลี่ยน `package-lock.json` อนุญาตเมื่อเป็นผลที่จำเป็นจากการอัปเดต direct dependency ที่ได้รับอนุมัติ; ไม่ใช้เป็นช่องทางอัปเดต transitive dependency แยกเอง. GitHub Actions versions เป็น manual maintenance และต้องผ่าน CI ปกติ. ดู `docs/DEPENDENCY-AUTOMATION.md`.

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

Backup/restore ทำงานกับ `runtime/data`, `runtime/obs`, `runtime/config`. Restore จะปฏิเสธการทำงานเมื่อพบ managed scoreboard process หรือพบ listener บน port ที่กำหนด (รองรับ `PORT`/`-Port` ไม่ได้ hard-code เฉพาะ 3000).

## Offline Windows package

สร้างด้วย:

```powershell
npm ci
npm run build:offline:windows
```

Package ที่ได้มี `server/`, `dist/client/`, production dependencies, `runtime/config/`, field tools และ `bin/node.exe`; เครื่องสนามไม่ต้อง `npm install`.

`START-SCOREBOARD.cmd` บันทึก managed PID record ใน `runtime/scoreboard.pid.json`. `STOP-SCOREBOARD.cmd` จะหยุดเฉพาะ process ที่ record นี้ชี้ถึงและตรวจว่าเป็น packaged Scoreboard ก่อน จึงไม่ฆ่าโปรแกรมอื่นเพียงเพราะใช้ TCP 3000.

Release workflow ใช้ validation gate ระดับเดียวกับ field CI ที่สำคัญ: build/check/tests, OBS stress, live field check, backup/restore drill, audit, package build และ staged-package runtime verification. ถ้าสร้างจาก tag ชื่อ tag ต้องตรงกับ `package.json` version (`v<version>`) เพื่อไม่ให้ artifact มี version metadata ขัดกัน.

## Field acceptance

CI ไม่ทดแทน physical field acceptance. ก่อนประกาศ **Field Approved** ต้องทดสอบเครื่องกลาง + OBS + Team A/B + LAN + audio + power recovery จริงตาม `docs/FIELD-ACCEPTANCE-CHECKLIST.md`.

รายละเอียด Client/Broadcast ดู `docs/CLIENT-BROADCAST-ARCHITECTURE.md`.

## Project purpose, origin and license

Robot Scoreboard เวอร์ชันนี้พัฒนาต่อยอดโดยมี **การศึกษา การเรียนรู้ และการแข่งขันของนักเรียน/นักศึกษา** เป็นวัตถุประสงค์หลัก โดยเฉพาะงานแข่งขันหุ่นยนต์และกิจกรรมที่เกี่ยวข้อง อย่างไรก็ตาม สามารถนำไปศึกษา ดัดแปลง แจกจ่าย และประยุกต์ใช้กับงานประเภทอื่น รวมถึงการใช้งานเชิงพาณิชย์ได้ ภายใต้เงื่อนไขของ GNU GPL

- **Original project author:** Buncha Sawaddee
- **Original project:** https://github.com/foAddz19/robot-scoreboard
- **Re-engineered and maintained by:** Supharoek Sudadet
- **Re-engineered repository:** https://github.com/yiwssx/robot-scoreboard

โปรเจกต์ต้นทางมี metadata ใน `package.json` ระบุ License เป็น ISC. เวอร์ชัน re-engineered นี้เผยแพร่ภายใต้ **GNU General Public License v3.0 or later (GPL-3.0-or-later)** โดยยังคงระบุที่มาและข้อมูล License ของต้นฉบับไว้ใน `NOTICE`.

การใช้งานเชิงพาณิชย์ **ไม่ได้ถูกห้าม** ภายใต้ GPL แต่ไม่ใช่วัตถุประสงค์หลักของโครงการนี้ ผู้ที่แจกจ่ายซอฟต์แวร์หรือเวอร์ชันดัดแปลงต้องปฏิบัติตามข้อกำหนดของ GPL ที่เกี่ยวข้อง

ดูข้อความ License ฉบับเต็มที่ [LICENSE](LICENSE) และรายละเอียดที่มาที่ [NOTICE](NOTICE).
