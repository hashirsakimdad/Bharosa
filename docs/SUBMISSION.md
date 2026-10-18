# Bharosa: Devpost submission

Copy each section into the matching Devpost field. Anything in [square brackets] is for you to fill in or delete.

---

## Tagline (under 200 characters)

Forward a seller's message before you pay. Bharosa tells you in seconds if it's a scam, shows the proof, and lets you pay through PayPal so you're covered.

## Inspiration

Most online buying where I live doesn't happen on a checkout page. It happens in Instagram DMs, Facebook Marketplace and WhatsApp chats. The seller sends a photo and a price, and then asks you to send money first by bank transfer, JazzCash or Easypaisa. If the parcel never shows up, that money is gone. There is no buyer protection and nobody to complain to.

[Optional: one or two lines about a time this happened to you or someone you know. A real story works better than anything else in this section.]

I wanted a check that needs nothing new. No app to install, no account, no English required. People already have the suspicious message open in WhatsApp, so the check should happen right there, in their language, and give a reason they can repeat to the seller instead of a bare score.

## What it does

You forward Bharosa whatever the seller sent: the chat text, a screenshot, a link, or a voice note. It works on WhatsApp and on a web page. A few seconds later you get one of three answers:

- 🔴 Don't pay
- 🟡 Be careful
- 🟢 Looks safe

Each answer comes with one plain sentence explaining it, in the language you wrote in: English, Urdu, Roman Urdu or Arabic. Reply WHY and you get every piece of evidence.

The checks behind the verdict:

- price compared with the usual market price for that item
- how they want to be paid (crypto, gift cards and "friends and family" are red flags)
- crypto wallet addresses pasted into the chat
- websites pretending to be a known brand, like apple-store-pk.shop
- how old the website's domain is, and whether Google Safe Browsing has flagged it
- requests for money upfront, and pressure lines like "3 people are waiting"
- how many other people have already reported this seller

If the verdict is green or yellow, Bharosa creates a PayPal checkout for the exact price. When the seller gave a PayPal email, the money goes straight to them and the buyer keeps PayPal buyer protection. A red verdict never gets a pay link.

Anyone can reply REPORT to warn the next person. If a buyer later opens a PayPal dispute on a Bharosa payment, that dispute also counts as a report against the seller.

Every check, report and payment is written into a hash chain, and the latest link is stamped on Bitcoin once a day. The public /proof page lets anyone confirm nothing has been edited or deleted since.

## How we built it

- **App:** Next.js 14 and TypeScript, deployed on Vercel.
- **AI:** Gemini on the free tier. It reads screenshots and transcribes voice notes, pulls out the price, payment method, links and phone numbers, and writes the one-line explanation. It never decides the color. Fixed rules do that: any danger signal is red, and two warnings are yellow. This keeps the verdict repeatable and stops the model from talking itself into "safe".
- **PayPal:** the Orders v2 API creates the safe-pay checkout, with the seller as payee when they gave a PayPal email. Webhooks cover captures, refunds and disputes. Every webhook is confirmed through PayPal's verify-signature API before Bharosa acts on it.
- **WhatsApp:** a Twilio webhook, with every request's Twilio signature checked. Twilio only waits 15 seconds for an answer, so slow checks reply "checking..." straight away and send the verdict as a follow-up.
- **Data:** Supabase Postgres with row-level security on every table. Phone numbers and handles are stored only as salted HMAC fingerprints, so the report network can count reports without keeping anyone's number.
- **Tamper-evident record:** each ledger entry is sha256(previous hash, sequence, kind, payload hash, time). A Postgres function appends entries under a lock, and a trigger blocks updates and deletes. Once a day the newest hash is stamped on Bitcoin through OpenTimestamps.

The whole check pipeline is one function, and the web page and WhatsApp both call it. With no API keys at all it still runs in rules-only mode, so a demo can't completely fail.

## Challenges we ran into

Money in these chats is mostly PKR, AED or SAR, and PayPal doesn't accept PKR. Prices in those currencies are converted to USD for the checkout, and the conversion is shown to the buyer.

Roman Urdu was harder than Urdu script. Urdu script is easy to detect from its letters, but "pehle advance bhejo" looks like English to most detectors. I combined a word list with the AI's own reading of the message, and wrote fixed reply templates in all four languages so the answer stays correct even when the AI is down.

PayPal verifies a webhook against the event exactly as it was sent. Parsing the JSON and re-encoding it can change number formats and key order, which makes a genuine event fail the check, so Bharosa passes the raw text through untouched.

Building OpenTimestamps proofs by hand meant matching the file format byte for byte. I checked every file Bharosa produces against the official OpenTimestamps library before trusting it.

## Accomplishments that we're proud of

- There is nothing to install or sign up for. You forward a message and read a color.
- The AI can't override the rules. Every verdict comes from rules you can read in the code, and every claim in the evidence list is a specific fact, like "domain registered 4 days ago".
- PayPal data feeds back into scam detection: a dispute on one buyer's payment warns the next buyer.
- 47 automated tests run offline, covering the verdict rules, WhatsApp conversations, webhook handling and the Bitcoin proofs.

## What we learned

[Write 2 or 3 honest lines in your own words. Some candidates: how much easier it is to trust an answer that shows its evidence, how Twilio's 15-second limit shaped the design, or what you learned about PayPal's webhook verification.]

## What's next for Bharosa

- An official WhatsApp Business number, so nobody has to join a sandbox
- Checking Instagram and OLX seller profiles directly from a link
- A badge for honest sellers who accept PayPal and have no reports, so buyers can trust them quickly
- Working with PayPal on seller pay links, so a seller's first reply can be a protected checkout instead of a bank account number

---

## Built with

next.js, typescript, react, tailwindcss, gemini, paypal-orders-api, paypal-webhooks, supabase, postgresql, twilio, whatsapp, opentimestamps, bitcoin, vercel

## Links to add on Devpost

- Live app: https://[your-vercel-url]
- Proof page: https://[your-vercel-url]/proof
- WhatsApp: the sandbox number and join code, so judges can try it
- Code: https://github.com/hashirsakimdad/Bharosa (make the repo public before submitting)
- Demo video: [YouTube link]
