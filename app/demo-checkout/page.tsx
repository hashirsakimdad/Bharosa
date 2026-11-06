import Link from "next/link";
import SiteNav from "@/components/site/SiteNav";

export const dynamic = "force-dynamic";

/**
 * Demo checkout, used only when PAYPAL_DEMO=true and no PayPal keys are set.
 * It is labelled as a demo everywhere and does not look like PayPal's own page.
 */
export default function DemoCheckout({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { token = "", checkId = "", amount = "0.00", currency = "USD", payee, item } = searchParams;
  const approve = `/api/paypal/return?token=${encodeURIComponent(token)}&checkId=${encodeURIComponent(checkId)}`;
  return (
    <>
    <SiteNav />
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6 sm:pt-10">
      <div className="rise rounded-2xl border-2 border-dashed border-careful-line bg-careful-soft px-4 py-3 text-base font-semibold text-careful">
        Demo mode: PayPal sandbox keys aren&apos;t configured, so this is a simulated checkout. No real payment is made.
      </div>
      <section className="pop mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-stone-500">BHAROSA SAFE PAY · DEMO</p>
        <h1 className="mt-2 text-3xl font-bold">
          {currency} {amount}
        </h1>
        {item && <p className="mt-1 text-lg text-stone-600">{item}</p>}
        <dl className="mt-5 space-y-2 text-base">
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Paid to</dt>
            <dd className="font-medium">{payee ?? "Bharosa demo merchant"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">With live keys</dt>
            <dd className="text-right font-medium">PayPal checkout + buyer protection</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Order</dt>
            <dd className="font-mono text-sm">{token}</dd>
          </div>
        </dl>
        <a href={approve} className="press mt-6 flex w-full justify-center rounded-2xl bg-safe hover:brightness-110 px-4 py-4 text-lg font-bold text-white">
          Approve demo payment
        </a>
        <Link href="/?payment=cancelled" className="mt-3 block text-center text-base text-stone-500 underline">
          Cancel
        </Link>
      </section>
    </main>
    </>
  );
}
