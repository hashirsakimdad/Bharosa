import Link from "next/link";
import SiteNav from "@/components/site/SiteNav";

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex max-w-xl flex-col items-start px-4 py-20">
        <div className="rise flex items-center gap-3">
          <span className="ping h-4 w-4 rounded-full bg-careful text-careful" aria-hidden />
          <p className="text-2xl font-bold text-careful">Be careful</p>
        </div>
        <h1 className="rise d1 mt-3 text-4xl font-extrabold tracking-tight">This page doesn&apos;t exist.</h1>
        <p className="rise d2 mt-3 text-lg text-stone-600">If someone sent you this link, check the message they sent with it too.</p>
        <Link href="/#check" className="rise d3 press mt-8 rounded-2xl bg-ink px-6 py-4 text-lg font-semibold text-white hover:bg-stone-800">
          Check a seller
        </Link>
      </main>
    </>
  );
}
