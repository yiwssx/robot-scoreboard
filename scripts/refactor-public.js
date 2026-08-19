"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const pagesDir = path.join(publicDir, "pages");
const commonJsDir = path.join(publicDir, "js", "common");
const pageJsDir = path.join(publicDir, "js", "pages");
const cssDir = path.join(publicDir, "css");
const pageCssDir = path.join(cssDir, "pages");

for (const dir of [pagesDir, commonJsDir, pageJsDir, cssDir, pageCssDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function move(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
}

move(path.join(publicDir, "brand.css"), path.join(cssDir, "brand.css"));
move(path.join(publicDir, "field-safety.js"), path.join(commonJsDir, "field-safety.js"));
move(path.join(publicDir, "final-warning.js"), path.join(commonJsDir, "final-warning.js"));

const pages = [
  ["control.html", "control"],
  ["team-a.html", "team-a"],
  ["team-b.html", "team-b"],
  ["team-names.html", "team-names"],
];

const canonicalLinks = new Map([
  ["/control.html", "/control"],
  ["/team-a.html", "/team/a"],
  ["/team-b.html", "/team/b"],
  ["/team-names.html", "/teams"],
]);

for (const [fileName, slug] of pages) {
  const source = path.join(publicDir, fileName);
  if (!fs.existsSync(source)) continue;

  let html = fs.readFileSync(source, "utf8");
  const styles = [];
  const scripts = [];

  html = html.replace(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi, (match, css) => {
    const value = css.trim();
    if (value) styles.push(value);
    return "";
  });

  html = html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
    const value = js.trim();
    if (value) scripts.push(value);
    return "";
  });

  html = html
    .replace(/href=["']\/brand\.css["']/gi, 'href="/css/brand.css"')
    .replace(/src=["']\/final-warning\.js["']/gi, 'src="/js/common/final-warning.js"')
    .replace(/src=["']\/field-safety\.js["']/gi, 'src="/js/common/field-safety.js"');

  for (const [legacy, canonical] of canonicalLinks) {
    html = html.split(legacy).join(canonical);
  }

  if (styles.length > 0) {
    fs.writeFileSync(path.join(pageCssDir, `${slug}.css`), `${styles.join("\n\n")}\n`, "utf8");
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/css/pages/${slug}.css">\n</head>`);
  }

  if (scripts.length > 0) {
    fs.writeFileSync(path.join(pageJsDir, `${slug}.js`), `"use strict";\n\n${scripts.join("\n\n")}\n`, "utf8");
  }

  const pageScript = scripts.length > 0 ? `  <script src="/js/pages/${slug}.js"></script>\n` : "";
  const safetyScript = '  <script src="/js/common/field-safety.js"></script>\n';
  html = html.replace(/<\/body>/i, `${pageScript}${safetyScript}</body>`);

  fs.writeFileSync(path.join(pagesDir, fileName), html, "utf8");
  fs.unlinkSync(source);
}

console.log("Public pages and assets refactored.");
