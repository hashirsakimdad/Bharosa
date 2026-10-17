/**
 * Live test: sends the 4 demo fixtures to a running server and prints verdicts.
 *   npm run dev            (in one terminal)
 *   npm run test:fixtures  (in another)
 * Optional: BASE_URL=https://your-app.vercel.app npm run test:fixtures
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const dir = join(__dirname, "..", "fixtures");
const COLOR = { safe: "\x1b[32m", careful: "\x1b[33m", danger: "\x1b[31m" } as Record<string, string>;
const RESET = "\x1b[0m";

async function main() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let failed = 0;

  for (const file of files) {
    const f = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}/api/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f.input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const pass = f.expected.includes(data.verdict);
      if (!pass) failed++;
      const flagged = data.signals
        .filter((s: { result: string }) => s.result === "danger" || s.result === "warn")
        .map((s: { name: string; result: string }) => `${s.name}:${s.result}`)
        .join(", ");

      console.log(`\n${pass ? "PASS" : "FAIL"}  ${f.name}`);
      console.log(`  verdict: ${COLOR[data.verdict] ?? ""}${data.verdict}${RESET} (expected ${f.expected.join(" or ")})  ${Date.now() - started}ms`);
      console.log(`  reason:  ${data.reason}`);
      console.log(`  flags:   ${flagged || "none"}`);
      console.log(`  source:  ${data.extracted.source}${data.payLink ? `  | pay link: yes (${data.pay.currency} ${data.pay.amount})` : ""}${data.record ? `  | record #${data.record.seq}` : ""}`);
      for (const n of data.notes ?? []) console.log(`  note:    ${n}`);
    } catch (e) {
      failed++;
      console.log(`\nERROR ${f.name}: ${(e as Error).message}`);
      if ((e as Error).message.includes("fetch failed")) console.log(`  Is the server running at ${BASE}? Start it with: npm run dev`);
    }
  }

  console.log(`\n${files.length - failed}/${files.length} fixtures passed`);
  process.exit(failed ? 1 : 0);
}

main();
