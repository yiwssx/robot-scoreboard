# Field Acceptance Checklist

ใช้ checklist นี้กับ **เครื่อง Windows, OBS, Router/Switch และอุปกรณ์ Team A/B ที่จะใช้จริง** ก่อน freeze release สำหรับการแข่งขัน

## 1. Machine readiness

- [ ] แตก Offline ZIP ลงโฟลเดอร์ถาวร ไม่รันจาก ZIP
- [ ] `START-SCOREBOARD.cmd` เปิด server และ `/control` ได้
- [ ] `/status` แสดง `READY FOR FIELD CHECK`
- [ ] `FIELD-CHECK.cmd` จบด้วย exit code 0
- [ ] มี IPv4 ของ LAN สนามแสดงใน `/status`
- [ ] พื้นที่ว่างดิสก์เพียงพอ
- [ ] ปิด/เปิด server ใหม่แล้ว state โหลดกลับถูกต้อง

## 2. OBS acceptance

- [ ] OBS Text Sources ชี้ไป `runtime/obs/*` ของ release นี้
- [ ] score A/B เปลี่ยนตามระบบ
- [ ] time/status เปลี่ยนตามระบบ
- [ ] SHOT A/B เปลี่ยนตามระบบ
- [ ] mission shot 1–4 ของ A/B เปลี่ยนครบ
- [ ] team name / school แสดงถูกต้อง
- [ ] เปิด OBS หลัง server แล้วค่าปัจจุบันยังอ่านได้
- [ ] ปิด/เปิด OBS ระหว่าง server ทำงานแล้วระบบไม่ error

## 3. LAN acceptance

ทดสอบอย่างน้อย 3 เครื่อง: Server/Control, Team A, Team B

- [ ] Team A เข้า `http://SERVER-IP:3000/team/a`
- [ ] Team B เข้า `http://SERVER-IP:3000/team/b`
- [ ] Team setup เข้า `http://SERVER-IP:3000/teams`
- [ ] refresh ทุกหน้าแล้วยัง sync state
- [ ] ปิด Wi-Fi เครื่อง Team A แล้วเปิดใหม่ สามารถ reconnect ได้
- [ ] ปิด Wi-Fi เครื่อง Team B แล้วเปิดใหม่ สามารถ reconnect ได้
- [ ] sleep/wake client แล้ว reconnect ได้
- [ ] ไม่มี port forwarding TCP 3000 ออก Internet

## 4. Match endurance

ทำอย่างน้อย 10–20 คู่ต่อเนื่อง

- [ ] READY → RUNNING
- [ ] RUNNING → PAUSED → RUNNING
- [ ] scoring ถูก reject นอก RUNNING
- [ ] mission เดิมกดซ้ำไม่ได้
- [ ] ครบเวลา → FINISH
- [ ] Result Review / Correction ใช้งานได้
- [ ] Finalize / Lock ใช้งานได้
- [ ] เตรียมคู่ใหม่ได้หลัง lock เท่านั้น
- [ ] match history ไม่ duplicate

## 5. Failure recovery

- [ ] ปิด browser Control ระหว่าง RUNNING แล้วเปิดใหม่
- [ ] refresh Team A/B พร้อมกัน
- [ ] stop server ระหว่าง RUNNING แล้ว start ใหม่ → restore เป็น PAUSED
- [ ] reboot Windows ระหว่างการแข่งขันจำลอง → restore เป็น PAUSED
- [ ] score/state ก่อน restart ไม่สูญหายเกิน persistence window ที่ยอมรับได้
- [ ] OBS เปิดอยู่ขณะ score เปลี่ยนเร็ว ๆ ไม่มี write failure ที่กระทบการแข่งขัน

## 6. Human-error guards

- [ ] Team A/B ไม่มี START / STOP / RESET
- [ ] RESET ถูก block ตอน RUNNING/PAUSED
- [ ] RESET ALL ต้องกดค้าง
- [ ] TEAM A และ TEAM B เลือกทีมเดียวกันไม่ได้
- [ ] duplicate rename ถูก reject
- [ ] Result ที่ lock แล้วแก้ไม่ได้

## 7. Audio

- [ ] browser ที่ใช้จริง unlock audio หลัง interaction
- [ ] final warning ดังจริง
- [ ] volume ของ Windows / browser / mixer / PA อยู่ระดับใช้งานสนาม
- [ ] refresh browser แล้วทดสอบ audio ใหม่

## 8. Backup / Restore drill

- [ ] `BACKUP-SCOREBOARD.cmd` สร้าง backup ได้
- [ ] backup มี `manifest.json`, `data/`, `obs/`, `config/` (สำเนาจาก `runtime/`)
- [ ] stop server ก่อน restore
- [ ] ทดลอง restore backup ในรอบซ้อม
- [ ] หลัง restore เปิด `/status` และตรวจ PASS ทั้งหมด
- [ ] เก็บสำเนา Field Approved ZIP + backup ล่าสุดใน USB สำรอง

## 9. Freeze / Release gate

สร้าง Field Approved release เมื่อทุกข้อ critical ผ่าน:

- [ ] CI green บน exact commit
- [ ] Windows Offline ZIP build ผ่าน
- [ ] 10–20 match endurance ผ่าน
- [ ] power/restart recovery ผ่าน
- [ ] OBS/LAN/audio ผ่านบนอุปกรณ์จริง
- [ ] backup/restore drill ผ่าน

หลัง freeze ห้าม refactor หรือ update dependency ก่อนวันแข่ง เว้นแต่แก้ defect ที่ยืนยันแล้วและต้อง rerun checklist ที่เกี่ยวข้อง
