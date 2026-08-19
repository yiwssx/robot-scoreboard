"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pages = path.join(root, "public", "pages");

function update(fileName, transform) {
  const filePath = path.join(pages, fileName);
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${fileName}`);
  fs.writeFileSync(filePath, after, "utf8");
}

update("control.html", (html) => html
  .replace(
    '<link rel="stylesheet" href="/css/pages/control.css">',
    '<link rel="stylesheet" href="/css/pages/control.css">\n  <link rel="stylesheet" href="/css/pages/control-safety.css">'
  )
  .replace('<button class="green" onclick="startTime()">เริ่ม</button>', '<button class="green" id="startTimeButton" type="button">เริ่ม</button>')
  .replace('<button class="red" onclick="stopTime()">หยุด</button>', '<button class="red" id="stopTimeButton" type="button">หยุด</button>')
  .replace('<button class="gray" id="resetScoreButton" onclick="resetScore()">RESET SCORE / SHOT</button>', '<button class="gray" id="resetScoreButton" type="button">RESET SCORE / SHOT</button>')
  .replace('<button class="blue" id="forceSyncButton" onclick="forceSyncScreens()">SYNC SCREENS</button>', '<button class="blue" id="forceSyncButton" type="button">SYNC SCREENS</button>')
  .replace('<button class="red" onclick="resetAll()">รีเซ็ตทั้งหมด</button>', '<button class="red" id="resetAllButton" type="button">รีเซ็ตทั้งหมด</button>')
  .replace(
    '  <script src="/js/pages/control.js"></script>\n  <script src="/js/common/field-safety.js"></script>',
    '  <script src="/js/pages/control.js"></script>\n  <script src="/js/common/notifications.js"></script>\n  <script src="/js/pages/control-actions.js"></script>\n  <script src="/js/pages/control-safety.js"></script>'
  ));

for (const fileName of ["team-a.html", "team-b.html"]) {
  update(fileName, (html) => html.replace(
    '  <script src="/js/common/field-safety.js"></script>',
    '  <script src="/js/common/notifications.js"></script>'
  ));
}

update("team-names.html", (html) => html.replace(
  '  <script src="/js/pages/team-names.js"></script>\n  <script src="/js/common/field-safety.js"></script>',
  '  <script src="/js/pages/team-names.js"></script>\n  <script src="/js/common/notifications.js"></script>\n  <script src="/js/pages/team-setup-safety.js"></script>'
));

for (const relative of [
  ["public", "js", "common", "field-safety.js"],
  ["public", "js", "pages", "team-a.js"],
  ["public", "js", "pages", "team-b.js"],
]) {
  const filePath = path.join(root, ...relative);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

console.log("Frontend polish applied.");
