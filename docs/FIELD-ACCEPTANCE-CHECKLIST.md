# Field Acceptance Checklist

Use this checklist with the **actual Windows machine, OBS setup, router/switch, and Team A/B devices that will be used in competition** before freezing the release.

## 1. Machine readiness

- [ ] Extract the Offline ZIP to a permanent folder; do not run directly from the ZIP archive
- [ ] `START-SCOREBOARD.cmd` starts the server and `/control` is accessible
- [ ] `/status` shows `READY FOR FIELD CHECK`
- [ ] `FIELD-CHECK.cmd` completes with exit code 0
- [ ] The field LAN IPv4 address is shown in `/status`
- [ ] Sufficient disk space is available
- [ ] After restarting the server, persisted state reloads correctly

## 2. OBS acceptance

- [ ] OBS Text Sources point to `runtime/obs/*` from this release
- [ ] Team A/B scores update correctly
- [ ] Time/status updates correctly
- [ ] SHOT A/B updates correctly
- [ ] Mission shots 1–4 for Team A/B all update correctly
- [ ] Team name / school displays correctly
- [ ] If OBS starts after the server, current values are still read correctly
- [ ] Closing and reopening OBS while the server is running does not cause system errors

## 3. LAN acceptance

Test with at least three machines/devices: Server/Control, Team A, and Team B.

- [ ] Team A can open `http://SERVER-IP:3000/team/a`
- [ ] Team B can open `http://SERVER-IP:3000/team/b`
- [ ] Team setup can open `http://SERVER-IP:3000/teams`
- [ ] Refreshing every page preserves synchronized state
- [ ] After disabling and re-enabling Wi-Fi on Team A, the client reconnects successfully
- [ ] After disabling and re-enabling Wi-Fi on Team B, the client reconnects successfully
- [ ] A client reconnects successfully after sleep/wake
- [ ] TCP 3000 is not port-forwarded to the Internet

## 4. Match endurance

Run at least 10–20 consecutive matches.

- [ ] READY → RUNNING
- [ ] RUNNING → PAUSED → RUNNING
- [ ] Scoring is rejected outside RUNNING state
- [ ] The same mission cannot be submitted twice
- [ ] Time expiration → FINISH
- [ ] Result Review / Correction works correctly
- [ ] Finalize / Lock works correctly
- [ ] A new match can be prepared only after the previous result is locked
- [ ] Match history contains no duplicates

## 5. Failure recovery

- [ ] Close the Control browser during RUNNING and reopen it successfully
- [ ] Refresh Team A/B simultaneously
- [ ] Stop the server during RUNNING and start it again → state restores as PAUSED
- [ ] Reboot Windows during a simulated competition → state restores as PAUSED
- [ ] Score/state loss after restart does not exceed the accepted persistence window
- [ ] With OBS running during rapid score changes, no write failure affects competition operation

## 6. Human-error guards

- [ ] Team A/B interfaces do not expose START / STOP / RESET
- [ ] RESET is blocked during RUNNING/PAUSED
- [ ] RESET ALL requires press-and-hold confirmation
- [ ] TEAM A and TEAM B cannot select the same team
- [ ] Duplicate rename is rejected
- [ ] A locked result cannot be modified

## 7. Audio

- [ ] The actual field browser unlocks audio after user interaction
- [ ] The final warning sound is audible
- [ ] Windows / browser / mixer / PA volume is appropriate for field operation
- [ ] After refreshing the browser, audio is tested again

## 8. Backup / Restore drill

- [ ] `BACKUP-SCOREBOARD.cmd` creates a backup successfully
- [ ] The backup contains `manifest.json`, `data/`, `obs/`, and `config/` copied from `runtime/`
- [ ] Stop the server before restore
- [ ] Perform a restore from backup during rehearsal
- [ ] After restore, open `/status` and verify that all checks PASS
- [ ] Keep a copy of the Field Approved ZIP and latest backup on a separate USB drive

## 9. Freeze / Release gate

Create a Field Approved release only after all critical checks pass:

- [ ] CI is green on the exact commit
- [ ] Windows Offline ZIP build passes
- [ ] 10–20 match endurance run passes
- [ ] Power/restart recovery passes
- [ ] OBS/LAN/audio passes on the actual field equipment
- [ ] Backup/restore drill passes

After the freeze, do not refactor or update dependencies before competition day unless fixing a confirmed defect. Any such change requires rerunning the relevant checklist sections.
