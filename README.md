# Robot Scoreboard — Offline Competition Edition

ระบบ Scoreboard สำหรับการแข่งขันหุ่นยนต์แบบ **Offline / Trusted LAN** ใช้ Node.js + Express + Socket.IO และส่งค่าคะแนน/เวลาไปยัง OBS ผ่านไฟล์ข้อความในโฟลเดอร์ `obs/`.

## หลักการออกแบบ

- ไม่มี login, token, cloud service หรือ Internet dependency ตอนใช้งานสนาม
- LAN ของสนามคือ security boundary; **ห้าม port-forward TCP 3000 ออก Internet**
- `control.html` เป็นศูนย์ควบคุมเวลา/reset/result review
- `team-a.html` และ `team-b.html` ใช้บันทึกคะแนน/ภารกิจของฝั่งตัวเองเท่านั้น
- Business rules และ validation อยู่ฝั่ง server เพื่อกันการกดซ้ำ/ข้อมูลผิด
- Runtime data ไม่ถูก commit ลง Git

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

ถ้า server/เครื่องถูก restart ระหว่าง `RUNNING` ระบบจะ restore คะแนนและเวลาเท่าที่ persist ล่าสุด แล้วกลับมาเป็น `PAUSED` เพื่อไม่ให้เวลาเดินต่อเองโดยไม่มีกรรมการควบคุม.

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

ค่าทั้งหมดถูก validate ก่อนนำไปใช้ และมี fallback เป็นค่า default หากไฟล์เสีย.

## Run สำหรับเครื่องพัฒนา

ต้องใช้ Node.js 20 ขึ้นไป:

```bash
npm ci
npm start
```

เปิด:

- Control: `http://localhost:3000/control.html`
- Team A: `http://localhost:3000/team-a.html`
- Team B: `http://localhost:3000/team-b.html`
- Team setup: `http://localhost:3000/team-names.html`
- Health check: `http://localhost:3000/healthz`

เครื่องอื่นในวง LAN ใช้ IP ของเครื่อง server เช่น `http://192.168.1.10:3000/team-a.html`.

## Human-error protection

- หน้า Team A/B ซ่อน START, STOP และ RESET; ใช้บันทึกคะแนนเท่านั้น
- คะแนน/mission ถูก reject ถ้า status ไม่ใช่ `RUNNING`
- Mission เดิมบันทึกซ้ำไม่ได้
- TEAM A และ TEAM B ห้ามเป็นทีมเดียวกัน
- Rename ทีมไปชนชื่อเดิมถูก reject; ไม่มี implicit merge
- RESET ALL ที่ Control ต้อง **กดค้างประมาณ 2 วินาที**
- RESET ถูก reject ขณะ `RUNNING` หรือ `PAUSED`

## Result Review / Correction

เมื่อครบเวลา ระบบบันทึกผลอัตโนมัติแต่ยังอยู่สถานะ Review:

- ปรับคะแนน ±10 / ±20
- แก้ SHOT หลัก
- แก้เวลาภารกิจ 1–4
- กด **ยืนยันผลการแข่งขันและล็อกผล**

เมื่อผลถูกล็อกแล้วจึงสามารถ RESET เพื่อเตรียมคู่ถัดไปได้.

## Event log

ทุก action สำคัญถูก append ลง:

```text
data/event-log.ndjson
```

ตัวอย่าง event: `MATCH_START`, `MATCH_PAUSE`, `SCORE_ADJUST`, `MISSION_SCORE`, `RESULT_CORRECT_SCORE`, `RESULT_FINALIZED`, `ACTION_REJECTED` พร้อมเวลา, elapsed time, score, team, socket id และ IP ของ client เมื่อมีข้อมูล.

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

การเขียนไฟล์เป็น asynchronous, debounced, atomic และเขียน OBS เฉพาะค่าที่เปลี่ยน พร้อม retry สำหรับ `EBUSY` / `EPERM` / `EACCES` ที่อาจเกิดบน Windows เมื่อมีโปรแกรมอ่านไฟล์พร้อมกัน.

## Tests

```bash
npm run check
npm test
npm run stress:obs
npm audit --audit-level=high
```

CI ตรวจ Node 20/22 บน Linux และมี `windows-latest` field-validation job ที่รัน tests, OBS persistence stress test พร้อม concurrent readers และสร้าง Offline Windows ZIP จริงเพื่อยืนยันว่าชุดสนามแพ็กได้ครบ.

## Offline Windows package

Workflow **Build Offline Windows Package** สร้างไฟล์:

```text
robot-scoreboard-windows-x64.zip
```

แพ็กเกจมี `node.exe`, dependencies และไฟล์ระบบครบ จึงไม่ต้องติดตั้ง Node.js หรือ `npm install` ที่สนาม. หลังแตก ZIP ให้ดับเบิลคลิก:

```text
START-SCOREBOARD.cmd
```

เพื่อเริ่ม server และเปิด Control Panel. ใช้ `STOP-SCOREBOARD.cmd` เมื่อต้องการหยุดระบบ.

สามารถสร้างจาก Windows เองได้ด้วย:

```powershell
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File scripts/build-offline-windows.ps1
```

## Migration จากเวอร์ชันเดิม

ก่อนอัปเดตเครื่องสนาม ให้สำรองโฟลเดอร์ `obs/` เดิมหนึ่งครั้ง. ระบบยังอ่าน legacy JSON จาก `obs/` ได้เมื่อยังไม่มีไฟล์ใหม่ใน `data/` แล้วจะ persist ต่อในโครงสร้างใหม่.

`node_modules/`, `data/*`, `obs/*`, log และ `dist/` ถูก ignore จาก Git โดยตั้งใจ.
