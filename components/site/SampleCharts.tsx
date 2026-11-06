/** Illustrative charts for the proof page. Every number here is made-up sample data and is labelled as such. */

const DAYS = [
  [9, 4, 7], [12, 5, 6], [8, 3, 9], [15, 6, 8], [11, 7, 10], [18, 5, 9], [14, 8, 12],
  [21, 6, 11], [17, 9, 13], [24, 7, 12], [19, 10, 15], [27, 8, 14], [23, 11, 16], [30, 9, 17],
]; // [red, yellow, green] per day

const SIGNALS: Array<[string, number]> = [
  ["Advance payment, no protection", 41],
  ["Price far below market", 36],
  ["Crypto or gift-card only", 28],
  ["Pressure to hurry", 24],
  ["Fake brand website", 17],
  ["New or hidden seller account", 12],
];

const PAY: Array<[string, number, string]> = [
  ["JazzCash / Easypaisa advance", 38, "bg-danger"],
  ["Bank transfer advance", 22, "bg-careful"],
  ["Crypto (USDT)", 14, "bg-danger"],
  ["PayPal", 16, "bg-safe"],
  ["Cash on delivery", 10, "bg-safe"],
];

export default function SampleCharts() {
  const max = Math.max(...DAYS.map((d) => d[0] + d[1] + d[2]));
  const totals = DAYS.reduce((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]);
  const all = totals[0] + totals[1] + totals[2];
  const sMax = SIGNALS[0][1];
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-bold">What people are checking</h2>
        <span className="rounded-full border-2 border-dashed border-careful-line bg-careful-soft px-3 py-1 text-sm font-semibold text-careful">
          Sample data, for illustration
        </span>
      </div>
      <p className="mt-1 text-sm text-stone-600">These charts show how the live numbers will look. The figures are made up, not real checks.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="lift rounded-3xl border border-stone-200 bg-white p-5">
          <p className="font-semibold">Checks per day, last 14 days</p>
          <div className="mt-1 flex gap-4 text-xs text-stone-600">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-danger" />Don&apos;t pay</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-careful" />Be careful</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-safe" />Looks safe</span>
          </div>
          <div className="mt-4 flex h-44 items-end gap-1.5 border-b border-stone-200" role="img" aria-label="Stacked bars of sample checks per day, rising from 20 to 56">
            {DAYS.map((d, i) => {
              const sum = d[0] + d[1] + d[2];
              return (
                <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className="bar-grow flex flex-col overflow-hidden rounded-t-md" style={{ height: `${(sum / max) * 100}%`, animationDelay: `${i * 40}ms` }}>
                    <div className="bg-safe" style={{ flex: d[2] }} />
                    <div className="bg-careful" style={{ flex: d[1] }} />
                    <div className="bg-danger" style={{ flex: d[0] }} />
                  </div>
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-xs text-white group-hover:block">{sum} checks</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-stone-500"><span>14 days ago</span><span>today</span></div>
        </div>

        <div className="lift rounded-3xl border border-stone-200 bg-white p-5">
          <p className="font-semibold">Verdict split</p>
          <div className="mt-4 flex h-5 overflow-hidden rounded-full">
            <div className="bg-danger" style={{ width: `${(totals[0] / all) * 100}%` }} />
            <div className="bg-careful" style={{ width: `${(totals[1] / all) * 100}%` }} />
            <div className="bg-safe" style={{ width: `${(totals[2] / all) * 100}%` }} />
          </div>
          <dl className="mt-4 space-y-2 text-[15px]">
            {[["Don't pay", totals[0], "text-danger"], ["Be careful", totals[1], "text-careful"], ["Looks safe", totals[2], "text-safe"]].map(([l, n, c]) => (
              <div key={l as string} className="flex justify-between">
                <dt className={`font-semibold ${c}`}>{l}</dt>
                <dd className="tabular-nums">{n} · {Math.round(((n as number) / all) * 100)}%</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-stone-600">{all} sample checks in total.</p>
        </div>

        <div className="lift rounded-3xl border border-stone-200 bg-white p-5">
          <p className="font-semibold">Most common danger signs</p>
          <ul className="mt-4 space-y-3">
            {SIGNALS.map(([l, n], i) => (
              <li key={l}>
                <div className="flex justify-between text-[15px]"><span>{l}</span><span className="tabular-nums text-stone-500">{n}%</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-stone-100">
                  <div className="bar-x h-full rounded-full bg-danger" style={{ width: `${(n / sMax) * 100}%`, animationDelay: `${i * 70}ms` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lift rounded-3xl border border-stone-200 bg-white p-5">
          <p className="font-semibold">How sellers asked to be paid</p>
          <ul className="mt-4 space-y-3">
            {PAY.map(([l, n, c], i) => (
              <li key={l}>
                <div className="flex justify-between text-[15px]"><span>{l}</span><span className="tabular-nums text-stone-500">{n}%</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-stone-100">
                  <div className={`bar-x h-full rounded-full ${c}`} style={{ width: `${(n / 38) * 100}%`, animationDelay: `${i * 70}ms` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-stone-600">Red bars are methods with no way to get money back.</p>
        </div>
      </div>
    </section>
  );
}
