import Checker from "@/components/Checker";
import HeroDemo from "@/components/landing/HeroDemo";
import Reveal from "@/components/landing/Reveal";
import SiteNav from "@/components/site/SiteNav";
import SiteFooter from "@/components/site/SiteFooter";

const STEPS = [
  { n: "1", t: "Forward it", d: "Paste the seller's message, drop a chat screenshot, share a link or send a voice note. On the web or on WhatsApp." },
  { n: "2", t: "We read it", d: "AI reads the price, the payment method, the website and the pressure. Then fixed rules pick the color, not the AI." },
  { n: "3", t: "You decide", d: "Red, yellow or green, with the reasons in plain words. Safe deals get a PayPal link that pays the seller directly." },
];

const COLORS = [
  { c: "danger", t: "Don't pay", d: "Any danger sign: crypto only, a fake brand site, a price far too low, an advance with no protection. No pay link, ever.", dot: "bg-danger", box: "bg-danger-soft border-danger-line", txt: "text-danger" },
  { c: "careful", t: "Be careful", d: "Two or more warnings, like a brand new account or a push to hurry. Ask for cash on delivery or PayPal.", dot: "bg-careful", box: "bg-careful-soft border-careful-line", txt: "text-careful" },
  { c: "safe", t: "Looks safe", d: "Fair price and a protected way to pay. One tap opens PayPal checkout with buyer protection.", dot: "bg-safe", box: "bg-safe-soft border-safe-line", txt: "text-safe" },
];

const TRUST = [
  { t: "AI reads, rules decide", d: "The model only pulls out facts. The verdict comes from rules you can read, so it can't be talked into a green." },
  { t: "Red never gets a pay link", d: "If anything looks wrong, Bharosa won't help money leave your account. That's the whole point." },
  { t: "Stamped on Bitcoin", d: "Every check, report and payment joins a hash chain that is timestamped on Bitcoin. Nobody can quietly edit the record, us included." },
  { t: "Your chats stay yours", d: "Only hashes are public. Phone numbers and message text never appear on the proof page." },
];

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      <SiteNav current="home" />

      {/* Hero */}
      <header className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
        <div>
          <p className="rise inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600">
            <span className="ping h-2 w-2 rounded-full bg-safe text-safe" aria-hidden /> Free scam check · English, Urdu, Roman Urdu
          </p>
          <h1 className="rise d1 mt-5 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Check the seller <br className="hidden sm:block" />before the money goes.
          </h1>
          <p className="rise d2 mt-5 max-w-xl text-lg leading-relaxed text-stone-600 sm:text-xl">
            Forward the seller&apos;s message, screenshot, link or voice note. Bharosa tells you in seconds if it&apos;s a scam, shows you why, and lets you pay safe sellers through PayPal.
          </p>
          <div className="rise d3 mt-8 flex flex-wrap gap-3">
            <a href="#check" className="press rounded-2xl bg-ink px-6 py-4 text-lg font-semibold text-white hover:bg-stone-800">Check a seller now</a>
            <a href="#how" className="press rounded-2xl border border-stone-300 bg-white px-6 py-4 text-lg font-medium hover:bg-stone-50">See how it works</a>
          </div>
          <p className="rise d4 mt-5 text-sm text-stone-500">No sign-up. Works on any phone.</p>
        </div>

        <div className="rise d3 relative mx-auto w-full max-w-sm" aria-hidden>
          <div className="glow absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-danger-soft via-paper to-safe-soft blur-2xl" />
          <HeroDemo />
        </div>
      </header>

      {/* Inputs strip */}
      <section className="border-y border-stone-200 bg-white">
        <ul className="rise d5 mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-3 px-4 py-5 text-[15px] font-medium text-stone-600">
          <li>💬 Text messages</li>
          <li>🖼️ Chat screenshots</li>
          <li>🔗 Shop links</li>
          <li>🎙️ Voice notes</li>
          <li>📱 Web and WhatsApp</li>
        </ul>
      </section>

      {/* Live checker */}
      <section id="check" className="scroll-mt-4 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-xl">
          <p className="text-sm font-semibold tracking-wide text-stone-500">TRY IT</p>
          <h2 className="mt-1 text-3xl font-bold sm:text-4xl">Check before you pay.</h2>
          <p className="mt-2 text-lg text-stone-600">Paste a message or drop a screenshot. Or tap one of the examples.</p>
          <div className="mt-6">
            <Checker embedded />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-4 bg-white px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-bold sm:text-4xl">Three steps. About ten seconds.</h2></Reveal>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, idx) => (
              <li key={s.n}><Reveal delay={idx * 120} className="h-full"><div className="lift h-full rounded-3xl border border-stone-200 bg-paper p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-lg font-bold text-white">{s.n}</span>
                <h3 className="mt-4 text-xl font-bold">{s.t}</h3>
                <p className="mt-2 text-[17px] leading-relaxed text-stone-600">{s.d}</p>
              </div></Reveal></li>
            ))}
          </ol>
        </div>
      </section>

      {/* Colors */}
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-bold sm:text-4xl">One color. No guessing.</h2></Reveal>
          <p className="mt-3 max-w-2xl text-lg text-stone-600">You don&apos;t need to know what a phishing domain is. You just need to know whether to send the money.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {COLORS.map((c, idx) => (
              <Reveal key={c.c} delay={idx * 120} className="h-full"><div className={`lift h-full rounded-3xl border-2 p-6 ${c.box}`}>
                <div className="flex items-center gap-3">
                  <span className={`h-4 w-4 rounded-full ${c.dot}`} aria-hidden />
                  <h3 className={`text-2xl font-bold ${c.txt}`}>{c.t}</h3>
                </div>
                <p className="mt-3 text-[17px] leading-relaxed text-ink">{c.d}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-ink px-4 py-16 text-white sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="text-3xl font-bold sm:text-4xl">Why you can trust the answer</h2></Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {TRUST.map((t, idx) => (
              <Reveal key={t.t} delay={idx * 100} className="h-full"><div className="lift h-full rounded-3xl border border-white/15 bg-white/5 p-6 hover:border-white/30">
                <h3 className="text-xl font-bold">{t.t}</h3>
                <p className="mt-2 text-[17px] leading-relaxed text-stone-300">{t.d}</p>
              </div></Reveal>
            ))}
          </div>
          <a href="/proof" className="mt-8 inline-block rounded-2xl bg-white px-6 py-4 text-lg font-semibold text-ink hover:bg-stone-100">See the public proof</a>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 py-20 text-center sm:px-6">
        <Reveal><h2 className="mx-auto max-w-2xl text-3xl font-extrabold sm:text-5xl">Ten seconds now can save a month&apos;s salary.</h2></Reveal>
        <a href="#check" className="mt-8 inline-block rounded-2xl bg-ink px-8 py-4 text-lg font-semibold text-white hover:bg-stone-800">Check a seller</a>
      </section>

      <SiteFooter />
    </div>
  );
}
