import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <p className="text-lg font-extrabold tracking-wide">
            BHAROSA<span className="text-safe">.</span>
          </p>
          <p className="mt-2 max-w-xs text-[15px] text-stone-600">Check the seller before the money goes. Free, in English, Urdu and Roman Urdu.</p>
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-stone-500">PRODUCT</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li><Link href="/#check" className="hover:underline">Check a seller</Link></li>
            <li><Link href="/#how" className="hover:underline">How it works</Link></li>
            <li><Link href="/proof" className="hover:underline">Public proof</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-stone-500">PROJECT</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li><a href="https://github.com/hashirsakimdad/Bharosa" className="hover:underline">Source on GitHub</a></li>
            <li className="text-stone-600">Built for the PayPal AI Hackathon</li>
          </ul>
        </div>
      </div>
      <p className="border-t border-stone-200 px-4 py-4 text-center text-xs text-stone-500">
        Fixed rules pick the color, AI only reads and explains. Bharosa gives advice, not a guarantee.
      </p>
    </footer>
  );
}
