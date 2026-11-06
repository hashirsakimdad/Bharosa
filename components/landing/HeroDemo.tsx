"use client";

import { useEffect, useState } from "react";

const SCENES = [
  { msg: "iPhone 15 Pro only $280. Pay in USDT, no COD. 5 people waiting!!", tone: "danger", title: "Don't pay", line: "Price is 77% below normal and they only take crypto." },
  { msg: "Bhai PS5 sirf 45k. Pehle 10000 advance JazzCash pe bhejo.", tone: "danger", title: "Paise mat bhejein", line: "Advance maang raha hai aur COD se mana kar raha hai." },
  { msg: "Sony XM5 headphones, sealed, $329. PayPal or cash on delivery.", tone: "safe", title: "Looks safe", line: "Fair price, and they accept PayPal or cash on delivery.", pay: "Pay USD 329 safely with PayPal" },
] as const;

const TONE = {
  danger: { box: "bg-danger-soft border-danger-line", txt: "text-danger", dot: "bg-danger" },
  safe: { box: "bg-safe-soft border-safe-line", txt: "text-safe", dot: "bg-safe" },
};

type Phase = "typing" | "checking" | "verdict";

export default function HeroDemo() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(SCENES[0].msg.length);
  const [phase, setPhase] = useState<Phase>("verdict");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms));
    const run = (n: number) => {
      const s = SCENES[n];
      setI(n);
      setPhase("typing");
      setTyped(0);
      const step = 28;
      for (let c = 1; c <= s.msg.length; c++) at(c * step, () => setTyped(c));
      const tEnd = s.msg.length * step;
      at(tEnd + 350, () => setPhase("checking"));
      at(tEnd + 1700, () => setPhase("verdict"));
      at(tEnd + 5200, () => run((n + 1) % SCENES.length));
    };
    at(3200, () => run(1));
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const s = SCENES[i];
  const t = TONE[s.tone];
  return (
    <div className="float rounded-[2.5rem] border-[10px] border-ink bg-paper p-4 shadow-2xl">
      <div className="flex items-center justify-between px-1 pb-3 text-xs font-semibold text-stone-500">
        <span>BHAROSA</span>
        <span className="flex items-center gap-1.5"><span className="ping h-1.5 w-1.5 rounded-full bg-safe text-safe" /> live</span>
      </div>
      <div className="min-h-[76px] rounded-2xl bg-white p-3 text-[15px] leading-snug text-stone-700 shadow-sm">
        <span className={phase === "typing" ? "caret" : ""}>&ldquo;{s.msg.slice(0, typed)}{typed >= s.msg.length ? "”" : ""}</span>
      </div>
      <div className={`mt-3 rounded-xl py-3 text-center text-[15px] font-semibold text-white transition-colors ${phase === "checking" ? "scan bg-stone-500" : "bg-ink"}`}>
        {phase === "checking" ? "Checking..." : "Check"}
      </div>
      <div className="mt-3 min-h-[150px]">
        {phase === "verdict" && (
          <div key={i} className={`pop rounded-2xl border-2 p-4 ${t.box}`}>
            <div className="flex items-center gap-2">
              <span className={`ping h-3 w-3 rounded-full ${t.dot} ${t.txt}`} />
              <p className={`text-lg font-bold ${t.txt}`}>{s.title}</p>
            </div>
            <p className="mt-1 text-[15px] leading-snug text-ink">{s.line}</p>
            {"pay" in s && <p className="mt-3 rounded-xl bg-[#ffc439] py-2.5 text-center text-sm font-bold text-[#003087]">{s.pay}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
