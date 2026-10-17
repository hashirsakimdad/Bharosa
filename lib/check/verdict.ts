import type { Signal, Verdict, VerdictColor } from "../types";

/**
 * Fixed rules. The AI never decides the color.
 *  - any "danger" signal            -> danger (red)
 *  - two or more "warn" signals     -> careful (yellow)
 *  - nothing informative was found  -> careful (yellow): we never call something safe blind
 *  - otherwise                      -> safe (green)
 */

// Signals that say "something is fine" only by absence; they don't count as real evidence.
const ABSENCE_ONLY = new Set(["pressureCheck", "advancePaymentCheck", "walletCheck"]);

export function decideVerdict(signals: Signal[]): { verdict: Verdict; color: VerdictColor; enoughInfo: boolean } {
  const danger = signals.filter((s) => s.result === "danger").length;
  const warn = signals.filter((s) => s.result === "warn").length;
  const evidence = signals.filter((s) => !ABSENCE_ONLY.has(s.name) && s.result !== "unknown").length;

  if (danger > 0) return { verdict: "danger", color: "red", enoughInfo: true };
  if (warn >= 2) return { verdict: "careful", color: "yellow", enoughInfo: true };
  if (evidence === 0 && warn === 0) return { verdict: "careful", color: "yellow", enoughInfo: false };
  return { verdict: "safe", color: "green", enoughInfo: true };
}

/** Most important signals first: danger, then warn. Used for explanations and the UI. */
export function rankSignals(signals: Signal[]): Signal[] {
  const order = { danger: 0, warn: 1, ok: 2, unknown: 3 } as const;
  return [...signals].sort((a, b) => order[a.result] - order[b.result]);
}
