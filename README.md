# Robot Scoreboard — Offline Competition Edition

ระบบ Scoreboard สำหรับการแข่งขันหุ่นยนต์แบบ **Offline / Trusted LAN** ใช้ Node.js + Express + Socket.IO และส่งค่าคะแนน/เวลาไปยัง OBS ผ่านไฟล์ใน `obs/`.

## Architecture

โปรเจกต์เป็น **layered modular monolith**: HTTP และ Socket.IO เป็น transport layer, business operations อยู่ใน services, validation/pure rules อยู่ใน domain และ filesystem/OBS/event log อยู่ใน infrastructure.

```text
robot-scoreboard/
├─ server.js                         # composition root / process lifecycle
├─ src/
│  ├─ application/                   # in-memory state + runtime orchestration
│  ├─ config/                        # env + competition rules
│  ├─ domain/                        # pure team/time/scoring/result rules
│  ├─ services/                      # match/scoring/team/result use cases
│  ├─ http/                          # app/routes/controllers/middleware
│  ├─ sockets/                       # Socket.IO transport modules
│  └─ infrastructure/
│     ├─ persistence/
│     ├─ logging/
│     └─ diagnostics/                # field-readiness checks
├─ public/
│  ├─ pages/
│  ├─ css/
│  ├─ js/
│  └─ assets/
├─ config/competition-rules.json
├─ data/
├─ obs/
├─ scripts/
├─ docs/
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

## หลักการใช้งานสนาม

- ไม่มี login, token, cloud service หรือ Internet dependency ตอนใช้งานสนาม
- LAN ของสนามคือ security boundary; **ห้าม port-forward TCP 3000 ออก Internet**
- Control เป็นศูนย์ควบคุมเวลา/reset/result review
- Team A/B ใช้บันทึกคะแนนและภารกิจของฝั่งตัวเอง
- Business rules และ validation อยู่ฝั่ง server
- Runtime data และ backup ไม่ถูก commit ลง Git

## URLs

Canonical routes:

- Control: `http://localhost:3000/control`
- Team A: `http://localhost:3000/team/a`
- Team B: `http://localhost:3000/team/b`
- Team setup: `http://localhost:3000/teams`
- Field status: `http://localhost:3000/status`
- Health check: `http://localhost:3000/healthz`
- Field status API: `http://localhost:3000/api/field-status`

URL เดิม `/control.html`, `/team-a.html`, `/team-b.html`, `/team-names.html`, `/status.html` รองรับด้วย redirect ไป canonical route.

## Field readiness

หน้า `/status` ตรวจ readiness ของเครื่องแม่แบบ read-only ต่อ state การแข่งขัน และ active-write probe เฉพาะ temporary file สำหรับ path ที่ต้องเขียนจริง:

- `data/` เขียนได้
- `obs/` เขียนได้
- `config/competition-rules.json` อ่านและ parse ได้
- page files หลักอยู่ครบ
- disk free space ของ `data/` และ `obs/`
- hostname / Node / platform
- IPv4 interfaces สำหรับ LAN สนาม
- scoreboard status, team A/B, result lock และเวลา

ถ้า critical check ไม่ผ่าน `/api/field-status` ตอบ HTTP `503` เพื่อไม่ให้ระบบถูกตีความว่า ready โดยผิดพลาด.

บน Offline Windows package ใช้:

```text
FIELD-CHECK.cmd
OPEN-FIELD-STATUS.cmd
```

`FIELD-CHECK.cmd` ตรวจ diagnostics และ HTTP routes หลักทั้งหมด. อย่างไรก็ตาม machine readiness ไม่แทนการทดสอบ OBS, LAN clients, audio และ power recovery บนอุปกรณ์จริง.

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

ถ้า server/เครื่อง restart ระหว่าง `RUNNING` ระบบ restore คะแนนและเวลาเท่าที่ persist ล่าสุด แล้วกลับมาเป็น `PAUSED`.

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

ค่าทั้งหมดถูก validate ก่อนใช้ และ fallback เป็นค่า default หากไฟล์เสีย; `/status` จะยังเตือนว่าไฟล์ rules ไม่พร้อมเมื่อ JSON parse ไม่ได้.

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

## Persistence / OBS

Persistent data:

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

## Backup / Restore

Offline Windows package มี:

```text
BACKUP-SCOREBOARD.cmd
RESTORE-SCOREBOARD.cmd
```

Backup เก็บ `data/`, `obs/`, `config/` พร้อม `manifest.json` ลง `backups/<timestamp>-<label>`.

Restore มี safety guard:

1. ต้องหยุด scoreboard ก่อน; ถ้า TCP 3000 ยัง LISTENING จะ reject
2. ต้องมี `manifest.json`, `data/`, `obs/`, `config/` ครบ
3. ก่อนเขียนทับ จะสร้าง `pre-restore` backup ของ current state อัตโนมัติ
4. หลัง restore ต้อง start server และตรวจ `/status` ก่อนกลับเข้าสนาม

## Tests / CI

```bash
npm run check
npm test
npm run stress:obs
npm audit --audit-level=high
```

CI ตรวจ Node 20/22 บน Linux. Windows field-validation เพิ่มการตรวจ:

- tests และ OBS stress
- start server จริงและรัน field route/readiness self-test
- backup → mutate → restore พร้อมตรวจ pre-restore backup
- สร้าง Offline Windows ZIP
- verify ว่า ZIP stage มี START/STOP/FIELD-CHECK/BACKUP/RESTORE และ status assets ครบ
- audit

## Offline Windows package

สร้างด้วย:

```powershell
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File scripts/build-offline-windows.ps1
```

แพ็กเกจมี `node.exe` และ dependencies ครบ ไม่ต้องติดตั้ง Node.js หรือ `npm install` ที่สนาม.

ไฟล์หลักที่ operator ใช้:

```text
START-SCOREBOARD.cmd
STOP-SCOREBOARD.cmd
FIELD-CHECK.cmd
OPEN-FIELD-STATUS.cmd
BACKUP-SCOREBOARD.cmd
RESTORE-SCOREBOARD.cmd
```

## Field acceptance / release freeze

ก่อนประกาศ release ว่า **Field Approved** ต้องใช้เครื่อง/OBS/network/audio จริงและทำ checklist:

```text
docs/FIELD-ACCEPTANCE-CHECKLIST.md
```

ขั้นต่ำควรผ่าน 10–20 match endurance, restart/power-loss recovery, OBS reopen/read contention, LAN reconnect, audio warning และ backup/restore drill. หลัง freeze ไม่ควร refactor หรือ update dependency ก่อนวันแข่ง เว้นแต่แก้ defect ที่ยืนยันแล้วและ rerun checklist ที่เกี่ยวข้อง.

## Migration จากเวอร์ชันเดิม

ก่อนอัปเดตเครื่องสนาม ให้สำรอง `obs/` เดิมหนึ่งครั้ง. ระบบยังอ่าน legacy JSON จาก `obs/` ได้เมื่อยังไม่มีไฟล์ใหม่ใน `data/` แล้ว persist ต่อในโครงสร้างใหม่.

`node_modules/`, `data/*`, `obs/*`, `backups/`, log และ `dist/` ถูก ignore จาก Git โดยตั้งใจ.
