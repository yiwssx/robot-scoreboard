# Robot Scoreboard — Offline Competition Edition

ระบบ Scoreboard สำหรับการแข่งขันหุ่นยนต์แบบ **Offline / Trusted LAN** ใช้ Node.js + Express + Socket.IO และส่งค่าคะแนน/เวลาไปยัง OBS ผ่านไฟล์ใน `obs/`.

## Architecture

โปรเจกต์เป็น **layered modular monolith**: HTTP และ Socket.IO เป็น transport layer, business operations อยู่ใน services, validation/pure rules อยู่ใน domain และ filesystem/OBS/event log อยู่ใน infrastructure.

```text
robot-scoreboard/
├─ server.js                         # composition root / process lifecycle
├─ src/
│  ├─ application/
│  │  ├─ scoreboard-state.js        # in-memory state model
│  │  └─ scoreboard-runtime.js      # projections, persistence orchestration, events
│  ├─ config/
│  │  ├─ env.js                     # runtime environment
│  │  └─ competition-rules.js       # validated competition rules
│  ├─ domain/
│  │  ├─ team.js
│  │  ├─ time.js
│  │  ├─ scoring.js
│  │  ├─ result.js
│  │  └─ index.js
│  ├─ services/
│  │  ├─ scoreboard.service.js      # service composition / public facade
│  │  ├─ match.service.js           # state machine + timer + recovery
│  │  ├─ scoring.service.js         # score / mission operations
│  │  ├─ team.service.js            # team setup operations
│  │  └─ result.service.js          # history / review / correction / finalize
│  ├─ http/
│  │  ├─ app.js
│  │  ├─ controllers/
│  │  ├─ middleware/
│  │  └─ routes/
│  ├─ sockets/
│  │  ├─ index.js
│  │  ├─ match.socket.js
│  │  ├─ scoring.socket.js
│  │  ├─ team.socket.js
│  │  └─ result.socket.js
│  └─ infrastructure/
│     ├─ persistence/file-store.js
│     └─ logging/event-log.js
├─ public/
│  ├─ pages/                         # HTML markup only
│  ├─ css/
│  │  ├─ brand.css
│  │  └─ pages/
│  ├─ js/
│  │  ├─ common/
│  │  └─ pages/
│  └─ assets/
├─ config/competition-rules.json
├─ data/
├─ obs/
├─ scripts/
└─ test/
```

Dependency direction:

```text
HTTP routes/controllers ─┐
Socket.IO transports ────┤
                         ▼
                      services
                         ▼
                       domain

services/application ──► infrastructure
```

Domain modules ไม่ import Express, Socket.IO, filesystem, OBS หรือ HTML. ไฟล์ entrypoint เดิมใน `src/*.js` บางรายการคงไว้เป็น thin compatibility facade เพื่อไม่ให้ scripts/tests หรือ consumer เดิมแตก.

## หลักการใช้งานสนาม

- ไม่มี login, token, cloud service หรือ Internet dependency ตอนใช้งานสนาม
- LAN ของสนามคือ security boundary; **ห้าม port-forward TCP 3000 ออก Internet**
- Control เป็นศูนย์ควบคุมเวลา/reset/result review
- Team A/B ใช้บันทึกคะแนนและภารกิจของฝั่งตัวเอง
- Business rules และ validation อยู่ฝั่ง server
- Runtime data ไม่ถูก commit ลง Git

## URLs

Canonical routes:

- Control: `http://localhost:3000/control`
- Team A: `http://localhost:3000/team/a`
- Team B: `http://localhost:3000/team/b`
- Team setup: `http://localhost:3000/teams`
- Health check: `http://localhost:3000/healthz`

URL เดิม `/control.html`, `/team-a.html`, `/team-b.html`, `/team-names.html` ยังรองรับโดย redirect ไป canonical route เพื่อ compatibility.

## State machine

```text
READY --START--> RUNNING --STOP--> PAUSED --START--> RUNNING
                      |
                      +--ครบเวลา--> FINISH --> RESULT REVIEW --> LOCKED

RESET/เลือกทีม/แก้ข้อมูลทีม ทำได้เมื่อ READY
คะแนน/SHOT/MISSION ทำได้เมื่อ RUNNING เท่านั้น
RESET ALL ใช้ไม่ได้ขณะ RUNNING/PAUSED
หลัง FINISH ต้องยืนยันผลก่อนเริ่มคู่ใหม่
```

ถ้า server/เครื่อง restart ระหว่าง `RUNNING` ระบบ restore คะแนนและเวลาเท่าที่ persist ล่าสุด แล้วกลับมาเป็น `PAUSED` เพื่อไม่ให้เวลาเดินต่อเอง.

## Competition rules

แก้ไขได้ที่ `config/competition-rules.json`:

```json
{
  "matchDurationSeconds": 180,
  "finalWarningSeconds": 10,
  "scoreAdjustments": [-20, -10, 10, 20],
  "missions": { "1": 10, "2": 20, "3": 20, "4": 20 }
}
```

ค่าทั้งหมดถูก validate ก่อนใช้ และ fallback เป็นค่า default หากไฟล์เสีย.

## Run สำหรับเครื่องพัฒนา

ต้องใช้ Node.js 20 ขึ้นไป:

```bash
npm ci
npm start
```

เครื่องอื่นใน LAN ใช้ IP ของเครื่อง server เช่น `http://192.168.1.10:3000/team/a`.

## Human-error protection

- หน้า Team A/B เป็น scoring-only; START/STOP/RESET อยู่ที่ Control
- คะแนน/mission ถูก reject ถ้า status ไม่ใช่ `RUNNING`
- Mission เดิมบันทึกซ้ำไม่ได้
- TEAM A และ TEAM B ห้ามเป็นทีมเดียวกัน
- Rename ทีมไปชนชื่อเดิมถูก reject
- RESET ALL ที่ Control ต้องกดค้างประมาณ 2 วินาที
- RESET ถูก reject ขณะ `RUNNING` หรือ `PAUSED`

## Result Review / Correction

เมื่อครบเวลา ระบบบันทึกผลอัตโนมัติแต่ยังอยู่สถานะ Review:

- ปรับคะแนน ±10 / ±20
- แก้ SHOT หลัก
- แก้เวลาภารกิจ 1–4
- กด **ยืนยันผลการแข่งขันและล็อกผล**

เมื่อผลถูกล็อกแล้วจึง RESET เพื่อเตรียมคู่ถัดไปได้.

## Event log

ทุก action สำคัญ append ลง `data/event-log.ndjson` เช่น `MATCH_START`, `MATCH_PAUSE`, `SCORE_ADJUST`, `MISSION_SCORE`, `RESULT_CORRECT_SCORE`, `RESULT_FINALIZED`, `ACTION_REJECTED` พร้อม elapsed time, score state และ client context เมื่อมีข้อมูล.

## Persistence / OBS

Persistent JSON:

```text
data/team-names.json
data/match-results.json
data/live-match-state.json
data/event-log.ndjson
```

OBS output:

```text
obs/score_a.txt
obs/score_b.txt
obs/time.txt
obs/status.txt
obs/shot_a.txt
obs/shot_b.txt
obs/mission_shot_a_1.txt ... mission_shot_b_4.txt
obs/team-name-a.text
obs/team-name-b.text
obs/nameschool-a.text
obs/nameschool-b.text
```

การเขียนไฟล์เป็น asynchronous, debounced, atomic และเขียน OBS เฉพาะค่าที่เปลี่ยน พร้อม retry สำหรับ `EBUSY` / `EPERM` / `EACCES` / `EEXIST` บน Windows.

## Tests

```bash
npm run check
npm test
npm run stress:obs
npm audit --audit-level=high
```

`npm run check` ตรวจ JavaScript ทุกไฟล์ใน `src/`, `public/js/`, `scripts/` และ `server.js`. Test suite ครอบคลุม domain, match state/recovery/result integrity, persistence และ HTTP canonical/legacy routes.

CI ตรวจ Node 20/22 บน Linux และ `windows-latest` รัน tests, OBS stress พร้อม concurrent readers, สร้าง Offline Windows ZIP และ audit.

## Offline Windows package

Workflow **Build Offline Windows Package** สร้าง `robot-scoreboard-windows-x64.zip` ที่มี `node.exe`, dependencies และไฟล์ระบบครบ ไม่ต้องติดตั้ง Node.js หรือ `npm install` ที่สนาม. หลังแตก ZIP ให้ดับเบิลคลิก `START-SCOREBOARD.cmd`; ระบบจะเปิด Control ที่ `/control`.

สร้างจาก Windows เองได้ด้วย:

```powershell
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File scripts/build-offline-windows.ps1
```

## Migration จากเวอร์ชันเดิม

ก่อนอัปเดตเครื่องสนาม ให้สำรอง `obs/` เดิมหนึ่งครั้ง. ระบบยังอ่าน legacy JSON จาก `obs/` ได้เมื่อยังไม่มีไฟล์ใหม่ใน `data/` แล้ว persist ต่อในโครงสร้างใหม่.

`node_modules/`, `data/*`, `obs/*`, log และ `dist/` ถูก ignore จาก Git โดยตั้งใจ.
