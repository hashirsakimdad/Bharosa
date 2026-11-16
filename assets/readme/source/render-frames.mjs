import { chromium } from "playwright";
import { mkdirSync, rmSync } from "fs";
const [,, html, out, w, h, fps] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto("file://" + html); const total = await p.evaluate(() => window.TOTAL);
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const n = Math.round(total * fps);
for (let i = 0; i < n; i++) { await p.evaluate((t) => window.render(t), i / fps); await p.screenshot({ path: `${out}/${String(i).padStart(4, "0")}.png` }); }
console.log(html, n, "frames"); await b.close();
