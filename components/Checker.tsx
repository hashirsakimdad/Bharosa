"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckResult, Signal } from "@/lib/types";
import f1 from "@/fixtures/01-obvious-scam.json";
import f2 from "@/fixtures/02-subtle-scam.json";
import f3 from "@/fixtures/03-safe-seller.json";
import f4 from "@/fixtures/04-roman-urdu-scam.json";

const SAMPLES = [f1, f2, f3, f4];

const VERDICT_UI = {
  danger: { title: "Don't pay", box: "bg-danger-soft border-danger-line", text: "text-danger", dot: "bg-danger" },
  careful: { title: "Be careful", box: "bg-careful-soft border-careful-line", text: "text-careful", dot: "bg-careful" },
  safe: { title: "Looks safe", box: "bg-safe-soft border-safe-line", text: "text-safe", dot: "bg-safe" },
} as const;

const RESULT_UI: Record<Signal["result"], { mark: string; cls: string; sr: string }> = {
  danger: { mark: "✕", cls: "bg-danger text-white", sr: "Danger" },
  warn: { mark: "!", cls: "bg-careful text-white", sr: "Warning" },
  ok: { mark: "✓", cls: "bg-safe text-white", sr: "OK" },
  unknown: { mark: "?", cls: "bg-stone-300 text-stone-700", sr: "Unknown" },
};

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function Checker() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("payment");
    if (p === "success") setBanner("Payment done through PayPal. You're covered by buyer protection.");
    if (p === "cancelled") setBanner("Payment cancelled. No money was sent.");
    if (p === "failed") setBanner("Payment didn't go through. No money was sent.");
    if (p) window.history.replaceState(null, "", "/");
  }, []);

  async function attach(file: File | undefined | null) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setImage(await compressImage(file));
    } catch {
      setError("Couldn't read that image. Try a PNG or JPG screenshot.");
    }
  }

  async function check() {
    if (!text.trim() && !image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowWhy(false);
    setReportMsg(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, imageBase64: image ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function report() {
    if (!result) return;
    setReportMsg("Reporting...");
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkId: result.id }),
    });
    const data = await res.json().catch(() => ({}));
    setReportMsg(data.message || data.error || "Couldn't report right now.");
  }

  const rtl = result && (result.language === "ur" || result.language === "ar");
  const ui = result ? VERDICT_UI[result.verdict] : null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:pt-14">
      <header className="mb-7">
        <p className="text-sm font-semibold tracking-wide text-stone-500">BHAROSA</p>
        <h1 className="mt-1 text-[2rem] font-bold leading-tight sm:text-4xl">Check before you pay.</h1>
        <p className="mt-2 text-lg text-stone-600">
          Paste the seller&apos;s message or drop a screenshot. You&apos;ll know in seconds if it&apos;s safe.
        </p>
      </header>

      {banner && (
        <div className="mb-5 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base" role="status">
          {banner}
        </div>
      )}

      <section
        className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach(e.dataTransfer.files?.[0]);
        }}
      >
        <label htmlFor="msg" className="sr-only">Seller&apos;s message or link</label>
        <textarea
          id="msg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
            if (file) {
              e.preventDefault();
              attach(file);
            }
          }}
          rows={5}
          placeholder="e.g. iPhone 15 only $280, pay in USDT, offer ends today..."
          className="w-full resize-none rounded-2xl bg-stone-50 p-4 text-lg outline-none ring-stone-300 placeholder:text-stone-400 focus:ring-2"
        />

        {image && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-stone-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Attached screenshot" className="h-16 w-16 rounded-xl object-cover" />
            <span className="flex-1 text-base text-stone-600">Screenshot attached</span>
            <button onClick={() => setImage(null)} className="rounded-full px-3 py-2 text-base text-stone-500 hover:bg-stone-200">
              Remove
            </button>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-2xl border border-stone-300 px-4 py-4 text-base font-medium hover:bg-stone-50"
          >
            Add screenshot
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => attach(e.target.files?.[0])} />
          <button
            onClick={check}
            disabled={loading || (!text.trim() && !image)}
            className="flex-1 rounded-2xl bg-ink px-4 py-4 text-lg font-semibold text-white transition disabled:opacity-40"
          >
            {loading ? "Checking..." : "Check"}
          </button>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Try an example">
        <span className="py-1.5 text-sm text-stone-500">Try:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.name}
            onClick={() => {
              setText(s.input.text);
              setImage(null);
              setResult(null);
            }}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            {s.short}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-danger-soft px-4 py-3 text-base text-danger" role="alert">
          {error}
        </p>
      )}

      {result && ui && (
        <section ref={resultRef} className={`verdict-in mt-6 scroll-mt-4 rounded-3xl border-2 p-5 ${ui.box}`} aria-live="polite">
          <div className="flex items-center gap-3">
            <span className={`h-4 w-4 shrink-0 rounded-full ${ui.dot}`} aria-hidden />
            <h2 className={`text-3xl font-bold ${ui.text}`}>{ui.title}</h2>
          </div>

          <p dir={rtl ? "rtl" : "ltr"} className={`mt-3 text-xl leading-relaxed text-ink ${result.language === "ur" ? "urdu" : ""}`}>
            {result.reason}
          </p>

          {result.pay && (
            <a
              href={result.pay.url}
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[#ffc439] px-4 py-4 text-lg font-bold text-[#003087] hover:brightness-95"
            >
              Pay {result.pay.currency} {result.pay.amount} safely with PayPal
            </a>
          )}
          {result.pay?.payee && (
            <p className="mt-2 text-center text-sm text-stone-600">Goes straight to the seller&apos;s PayPal: {result.pay.payee}</p>
          )}
          {result.pay?.convertedFrom && (
            <p className="mt-2 text-center text-sm text-stone-600">
              Converted from {result.pay.convertedFrom.currency} {result.pay.convertedFrom.amount.toLocaleString()} (approx. rate)
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => setShowWhy((v) => !v)}
              aria-expanded={showWhy}
              className="rounded-full bg-white/70 px-4 py-2 text-base font-medium hover:bg-white"
            >
              {showWhy ? "Hide details" : "Why?"}
            </button>
            {result.verdict !== "safe" && !reportMsg && (
              <button onClick={report} className="rounded-full bg-white/70 px-4 py-2 text-base font-medium hover:bg-white">
                Report this seller
              </button>
            )}
          </div>
          {reportMsg && <p className="mt-3 text-base text-stone-700">{reportMsg}</p>}

          {showWhy && (
            <ul className="mt-4 space-y-2">
              {result.signals.map((s) => (
                <li key={s.name} className="flex gap-3 rounded-2xl bg-white/80 p-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${RESULT_UI[s.result].cls}`}
                  >
                    <span aria-hidden>{RESULT_UI[s.result].mark}</span>
                    <span className="sr-only">{RESULT_UI[s.result].sr}</span>
                  </span>
                  <div>
                    <p className="font-semibold">
                      {s.label}
                      {s.estimated && <span className="ml-2 text-xs font-normal text-stone-500">AI estimate</span>}
                    </p>
                    <p className="text-[15px] text-stone-700">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {result.record && (
            <p className="mt-4 text-xs text-stone-600">
              Tamper-proof record #{result.record.seq} · {result.record.entryHash.slice(0, 10)}…{result.record.entryHash.slice(-6)} ·{" "}
              <a href="/proof" className="underline">
                verify
              </a>
            </p>
          )}
          {result.notes.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-stone-500">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-10 text-center text-sm text-stone-500">
        We never decide with AI alone: fixed rules pick the color, AI only reads and explains.
        <br />
        <a href="/proof" className="underline">
          Every check is chained and stamped on Bitcoin. See the proof.
        </a>
      </footer>
    </main>
  );
}
