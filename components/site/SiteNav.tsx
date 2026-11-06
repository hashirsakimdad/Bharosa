import Link from "next/link";

export default function SiteNav({ current }: { current?: "home" | "proof" }) {
  const link = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full px-3 py-2 text-[15px] transition-colors ${on ? "bg-white font-semibold text-ink shadow-sm" : "text-stone-600 hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="sticky top-0 z-30 border-b border-transparent bg-paper/80 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="text-lg font-extrabold tracking-wide">
          BHAROSA<span className="text-safe">.</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden sm:block">{link("/#how", "How it works", false)}</span>
          {link("/proof", "Proof", current === "proof")}
          <Link href="/#check" className="press ml-1 rounded-full bg-ink px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-stone-800">
            Check a seller
          </Link>
        </div>
      </div>
    </nav>
  );
}
