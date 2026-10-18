import type { Metadata } from "next";
import Link from "next/link";
import { getStats, recentLedger } from "@/lib/db";
import { verifyLedger, type LedgerVerification } from "@/lib/ledger";
import { listAnchors, type AnchorRow } from "@/lib/anchor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Bharosa: proof",
  description: "Every Bharosa check, report and payment is chained and stamped on Bitcoin. Check it yourself.",
};

const KIND_LABEL: Record<string, string> = {
  check: "Check",
  report: "Scam report",
  payment_created: "Pay link created",
  payment_captured: "Payment completed",
  payment_refunded: "Payment refunded",
  payment_disputed: "Payment disputed",
};

function short(h: string, n = 10) {
  return `${h.slice(0, n)}…${h.slice(-6)}`;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

async function load() {
  try {
    const [stats, chain, entries, anchors] = await Promise.all([
      getStats(),
      verifyLedger().catch(() => null as LedgerVerification | null),
      recentLedger(12),
      listAnchors(10).catch(() => [] as AnchorRow[]),
    ]);
    return { stats, chain, entries, anchors };
  } catch {
    return { stats: null, chain: null, entries: [], anchors: [] as AnchorRow[] };
  }
}

export default async function ProofPage() {
  const { stats, chain, entries, anchors } = await load();
  const anchoredHere = anchors[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:pt-14">
      <header>
        <Link href="/" className="text-sm font-semibold tracking-wide text-stone-500 hover:text-ink">
          BHAROSA
        </Link>
        <h1 className="mt-1 text-[2rem] font-bold leading-tight sm:text-4xl">Don&apos;t trust us. Check.</h1>
        <p className="mt-3 max-w-2xl text-lg text-stone-600">
          Every check, scam report and payment is written into a chain where each record locks in the one before it. Every
          day the newest link is stamped on Bitcoin. Change or delete one old record and the chain breaks, and it no longer
          matches what Bitcoin recorded.
        </p>
      </header>

      {!stats ? (
        <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-5">
          <p className="text-lg">The database isn&apos;t connected yet, so there&apos;s no live record to show.</p>
          <p className="mt-2 text-stone-600">Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and run supabase/setup.sql.</p>
        </section>
      ) : (
        <>
          {/* Chain status */}
          <section
            className={`mt-8 rounded-3xl border-2 p-5 ${
              chain?.valid ? "border-safe-line bg-safe-soft" : chain ? "border-danger-line bg-danger-soft" : "border-stone-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`h-4 w-4 rounded-full ${chain?.valid ? "bg-safe" : chain ? "bg-danger" : "bg-stone-300"}`}
              />
              <h2 className={`text-2xl font-bold ${chain?.valid ? "text-safe" : chain ? "text-danger" : ""}`}>
                {chain?.valid ? "Chain intact" : chain ? "Chain broken" : "Couldn't check the chain"}
              </h2>
            </div>
            {chain && (
              <p className="mt-2 text-base text-ink">
                {chain.valid
                  ? `All ${chain.length.toLocaleString()} records link up, and ${chain.checkedRecords.toLocaleString()} stored checks and reports still match their hashes.`
                  : `Problem at record #${chain.problem?.seq}: ${chain.problem?.reason}.`}
              </p>
            )}
            {chain && chain.length > 0 && (
              <p className="mt-2 break-all font-mono text-xs text-stone-600">latest: {chain.headHash}</p>
            )}
            <a href="/api/ledger/verify" className="mt-3 inline-block text-sm font-medium underline">
              Run the verification yourself (JSON)
            </a>
          </section>

          {/* Stats */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Checks", stats.checks],
              ["Don't pay", stats.danger],
              ["Scam reports", stats.reports],
              ["Safe payments", stats.paymentsCompleted],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-3xl font-bold tabular-nums">{(n as number).toLocaleString()}</p>
                <p className="mt-1 text-sm text-stone-600">{label}</p>
              </div>
            ))}
          </section>
          {stats.checks > 0 && (
            <p className="mt-3 text-sm text-stone-600">
              {stats.danger} red · {stats.careful} yellow · {stats.safe} green
              {stats.whatsapp > 0 ? ` · ${stats.whatsapp} via WhatsApp` : ""}
            </p>
          )}

          {/* Bitcoin anchors */}
          <section className="mt-10">
            <h2 className="text-xl font-bold">Stamped on Bitcoin</h2>
            {anchors.length === 0 ? (
              <p className="mt-2 text-stone-600">No stamps yet. The first one is made at the next daily run.</p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {anchors.map((a) => (
                    <li key={a.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">First {Number(a.ledger_seq).toLocaleString()} records</p>
                        <p className="text-sm text-stone-500">{ago(a.created_at)}</p>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-stone-600">{short(a.head_hash, 16)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={`/api/anchors/${a.id}/anchor.txt`}
                          className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
                        >
                          Download file
                        </a>
                        <a
                          href={`/api/anchors/${a.id}/anchor.txt.ots`}
                          className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
                        >
                          Download proof (.ots)
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-[15px] text-stone-700">
                  <li>Download the file and its proof.</li>
                  <li>
                    Drop both onto{" "}
                    <a href="https://opentimestamps.org" className="underline" target="_blank" rel="noreferrer">
                      opentimestamps.org
                    </a>
                    .
                  </li>
                  <li>
                    It shows the Bitcoin block that proves this record existed at that time. Fresh stamps take a few hours to
                    reach a block.
                  </li>
                </ol>
                {anchoredHere && chain?.valid && chain.length > Number(anchoredHere.ledger_seq) && (
                  <p className="mt-3 text-sm text-stone-600">
                    {(chain.length - Number(anchoredHere.ledger_seq)).toLocaleString()} newer records will be included in the
                    next stamp.
                  </p>
                )}
              </>
            )}
          </section>

          {/* Recent records */}
          {entries.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">Latest records</h2>
              <p className="mt-1 text-sm text-stone-600">
                Only hashes are public. Phone numbers and messages never appear here.
              </p>
              <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">What</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Hash</th>
                      <th className="px-3 py-2 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.seq} className="border-t border-stone-100">
                        <td className="px-3 py-2 tabular-nums text-stone-500">{e.seq}</td>
                        <td className="px-3 py-2">{KIND_LABEL[e.kind] ?? e.kind}</td>
                        <td className="hidden px-3 py-2 font-mono text-xs text-stone-600 sm:table-cell">{short(e.entry_hash)}</td>
                        <td className="px-3 py-2 text-right text-stone-500">{ago(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <section className="mt-10 rounded-3xl border border-stone-200 bg-white p-5">
        <h2 className="text-xl font-bold">How the verdict is made</h2>
        <ul className="mt-3 space-y-2 text-[15px] text-stone-700">
          <li>
            <strong>AI reads, rules decide.</strong> Gemini reads the message, screenshot or voice note. Fixed rules pick the
            color: any danger sign means red, two warnings mean yellow.
          </li>
          <li>
            <strong>Red never gets a pay link.</strong> Green and yellow get a PayPal link, paid straight to the seller when
            they gave a PayPal email, so the buyer has PayPal buyer protection.
          </li>
          <li>
            <strong>PayPal feeds back in.</strong> Verified PayPal webhooks record payments, refunds and disputes. A dispute
            counts as a scam report against that seller.
          </li>
          <li>
            <strong>Private by design.</strong> Phone numbers and handles are stored only as salted fingerprints.
          </li>
        </ul>
      </section>

      <footer className="mt-10 text-center text-sm text-stone-500">
        <Link href="/" className="underline">
          Check a seller
        </Link>
      </footer>
    </main>
  );
}
