# Robot Scoreboard — Offline Competition Edition

ระบบ Scoreboard สำหรับการแข่งขันหุ่นยนต์แบบ **Offline / Trusted LAN** โดยให้เครื่องกลางเป็น authoritative host สำหรับกติกา เวลา คะแนน persistence และระบบ Broadcast/OBS ส่วนเครื่อง Team A และ Team B เป็น thin browser clients สำหรับบันทึกคะแนนเท่านั้น

## Runtime topology

```text
TEAM A browser ─┐
                ├── trusted LAN ──► CENTRAL MACHINE
TEAM B browser ─┘                    ├─ Node.js / Express / Socket.IO
                                     ├─ authoritative competition state
Control / Teams / Status ───────────►├─ data persistence
                                     ├─ local OBS text output
                                     ├─ read-only Browser Source overlay
                                     └─ OBS Studio
```

ข้อกำหนดหลัก:

- OBS อยู่ที่ **เครื่องกลางเท่านั้น**
- เครื่อง Team A/B ไม่มี OBS, `obs/`, Node.js หรือ npm dependency
- OBS text output ใช้ local filesystem ของเครื่องกลาง ไม่ผ่าน LAN
- OBS Browser Source ใช้ `http://127.0.0.1:3000/overlay/main`
- ถ้า LAN สนามมีปัญหา Server/Control/OBS บนเครื่องกลางยังทำงานต่อได้
- ไม่มี login/token/cloud/Internet dependency ตอนใช้งานสนาม; trusted LAN คือ security boundary
- ห้าม port-forward TCP 3000 ออก Internet

## Architecture

Backend เป็น layered modular monolith:

```text
HTTP / Socket transports
          │
          ▼
       services
          │
          ▼
        domain

application ──► persistence / broadcast ports
```

Frontend เป็น **Vite + TypeScript + Preact Multi-Page Application** ที่ compile เป็น static assets ก่อนนำลงสนาม:

```text
frontend/src/
├─ apps/
│  ├─ control/
│  ├─ team/          # shared Team A/B application
│  ├─ teams/
│  ├─ status/
│  └─ overlay/       # read-only OBS Browser Source
├─ core/
│  ├─ contracts.ts
│  ├─ realtime.ts
│  └─ store.ts
├─ features/
└─ shared/
```

Field runtime ไม่รัน Vite server และไม่ต้องมี TypeScript/Preact packages; bundle ที่ build แล้วอยู่ใน `public/app/`.

### Client data flow

```text
Socket.IO update
      │
      ▼
central realtime client
      │
      ▼
    store
      │
      ▼
Preact components
```

แต่ละ page มี Socket.IO connection หลักเพียงชุดเดียวผ่าน realtime client กลาง. Component ไม่เปิด `io()` เองและไม่รู้ transport details.

Backend เป็น single source of truth สำหรับ competition rules รวมถึง winner/result logic; frontend แสดง `winner`/`winnerName` ที่ backend คำนวณแล้ว ไม่คำนวณกติกาซ้ำ.

## Broadcast / OBS architecture

Application layer สร้าง `BroadcastState` ที่มีเฉพาะข้อมูลที่ต้องออกอากาศ จากนั้นส่งไป adapters:

```text
Authoritative scoreboard state
            │
            ▼
    Broadcast Projector
            │
            ▼
      BroadcastState
        ┌───┴──────────────┐
        ▼                  ▼
TextFileBroadcastOutput   /broadcast Socket.IO
        │                  │
        ▼                  ▼
     obs/*.txt        Browser Source overlay
        │                  │
        └──────► OBS Studio ◄──────┘
```

`scoreboard-runtime` ไม่รู้ชื่อไฟล์ OBS แล้ว. Mapping เช่น `score_a.txt` และ `time.txt` อยู่ใน infrastructure adapter เท่านั้น.

### OBS text output

Text output ยังคงเป็น reliable primary/fallback path และรักษาพฤติกรรมเดิม:

- changed-only writes
- debounce
- atomic replace
- retry บน Windows สำหรับ `EBUSY`, `EPERM`, `EACCES`, `EEXIST`
- ทำงาน local บนเครื่องกลาง

ไฟล์หลัก:

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

### OBS Browser Source

ใช้ URL local:

```text
http://127.0.0.1:3000/overlay/main
```

Overlay เชื่อม `/broadcast` namespace ซึ่งมีเฉพาะ server → client `broadcast:update`; ไม่มี START/STOP/RESET/scoring handlers จึงเป็น read-only transport โดย design.

## URLs

- Control: `http://localhost:3000/control`
- Team A: `http://IP-เครื่องกลาง:3000/team/a`
- Team B: `http://IP-เครื่องกลาง:3000/team/b`
- Team setup: `http://localhost:3000/teams`
- Field status: `http://localhost:3000/status`
- OBS overlay: `http://127.0.0.1:3000/overlay/main`
- Health: `http://localhost:3000/healthz`
- Field status API: `http://localhost:3000/api/field-status`

Legacy `.html` URLs ยังคง redirect ไป canonical routes.

## State machine

```text
READY --START--> RUNNING --STOP--> PAUSED --START--> RUNNING
                      |
                      +--ครบเวลา--> FINISH --> RESULT REVIEW --> LOCKED
```

- Team A/B scoring ทำได้เฉพาะ `RUNNING`
- START/STOP/RESET อยู่ที่ Control
- RESET ALL ถูกป้องกันด้วย hold action และใช้ไม่ได้ระหว่าง active/review pending
- หลัง FINISH ต้อง review/finalize ก่อนคู่ถัดไป

## Persistence

```text
data/team-names.json
data/match-results.json
data/live-match-state.json
data/event-log.ndjson
```

Data persistence และ broadcast file output ใช้ write queues แยกกันบน shared atomic-write primitive. Legacy OBS JSON/text ยังอ่านได้เพื่อ migration แต่ระบบใหม่ persist state ลง `data/`.

## Field readiness

`/status` ตรวจ:

- `data/` writable
- `obs/` writable
- competition rules valid
- canonical HTML pages ครบ
- compiled frontend entries `public/app/*.js` ครบ
- Broadcast text-output health
- hostname/platform/Node/disk/LAN IPv4
- connected clients แยก role เช่น `team-a`, `team-b`, `control`, `overlay`
- scoreboard state

ถ้า critical check ไม่ผ่าน `/api/field-status` ตอบ HTTP 503.

## Development / validation

```bash
npm ci
npm run build:frontend
npm run check
npm test
npm run stress:obs
npm audit --audit-level=high
```

`npm run check` รวม JavaScript syntax check และ TypeScript strict typecheck.

CI ตรวจ Node 20/22 บน Linux และ Windows field-validation ซึ่งรวม:

- frontend build
- TypeScript + JavaScript checks
- backend/domain/integration/broadcast tests
- OBS broadcast stress 1,500 updates พร้อม concurrent readers
- live server field self-test
- backup/restore drill
- Offline Windows ZIP build + content verification
- security audit

## Offline Windows package

สร้างด้วย:

```powershell
npm ci
npm run build:offline:windows
```

Packaging จะ build frontend ก่อน แล้ว prune devDependencies ออกจาก staged runtime. ดังนั้นเครื่องสนามได้เฉพาะ bundled frontend + production Node dependencies + `node.exe`.

Operator files:

```text
START-SCOREBOARD.cmd
STOP-SCOREBOARD.cmd
FIELD-CHECK.cmd
OPEN-FIELD-STATUS.cmd
OPEN-OBS-OVERLAY.cmd
BACKUP-SCOREBOARD.cmd
RESTORE-SCOREBOARD.cmd
```

เครื่องสนามไม่ต้อง `npm install`.

## Backup / Restore

Backup เก็บ `data/`, `obs/`, `config/` พร้อม manifest. Restore ต้อง STOP server ก่อนและระบบจะสร้าง pre-restore backup อัตโนมัติก่อนเขียนทับ.

## Field acceptance / release freeze

ก่อนประกาศ release ว่า **Field Approved** ต้องทดสอบเครื่องกลาง + OBS + Team A/B devices + LAN + audio + power recovery จริงตาม:

```text
docs/FIELD-ACCEPTANCE-CHECKLIST.md
```

CI ไม่ทดแทน physical field acceptance. หลังผ่านจริงแล้วจึง tag/freeze release สำหรับวันแข่งขัน.

รายละเอียดสถาปัตยกรรม client/broadcast ดู `docs/CLIENT-BROADCAST-ARCHITECTURE.md`.
