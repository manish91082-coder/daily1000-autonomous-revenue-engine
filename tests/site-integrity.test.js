const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");
test("page has viewport and no remote scripts",()=>{const h=fs.readFileSync("site/index.html","utf8");assert.match(h,/name="viewport"/);assert.doesNotMatch(h,/<script[^>]+src=["']https?:/i);});
test("app has no network or persistent storage calls",()=>{const s=fs.readFileSync("site/app.js","utf8");assert.doesNotMatch(s,/fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);});
