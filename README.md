# Bharosa

**Check before you pay.** Forward a seller's message, link or screenshot. Bharosa tells you in seconds if it's safe to pay, shows the evidence, and lets you pay through PayPal so you're covered by buyer protection.

Built for the PayPal AI Hackathon 2026.

- Green / yellow / red verdict with a one-line reason in the user's language (English, Urdu, Roman Urdu, Arabic)
- Fixed rules pick the color. AI only reads the message and writes the explanation
- "Pay safely with PayPal" link for green/yellow. A red verdict can never create a pay link
- Community scam reports, stored as salted fingerprints (never raw numbers)
- Tamper-evident hash chain: every check, report and payment is chained, and anyone can verify it
- Works on WhatsApp too: forward a message, screenshot or voice note, get the verdict in the same chat
- Works with zero API keys (rules-only mode), so the demo never fully breaks

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in what you have, everything is optional
npm run dev                   # http://localhost:3000
```

With no keys at all, the rule-based checks still run. Add keys one at a time:

| What | Where (all free) | Unlocks |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | Reading screenshots, market-price check, natural explanations |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | https://developer.paypal.com → Apps & Credentials → Sandbox → Create App | "Pay safely with PayPal" button |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | History, scam reports, hash chain |
| `HASH_SALT` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Private fingerprints |
| `SAFE_BROWSING_API_KEY` | Google Cloud console → Safe Browsing API | Known-malicious link check |

### Supabase setup

Open your project → **SQL Editor** → paste all of `supabase/setup.sql` → **Run**. (It's the two migrations in `supabase/migrations/` combined, and safe to run twice.)
It creates `checks`, `payments`, `reports`, `ledger`, the `append_ledger()` function and turns on row-level security.

### PayPal sandbox test

1. In the PayPal developer dashboard, open **Sandbox accounts** and note the personal (buyer) account email + password.
2. Check the "Normal headphones sale" example → click **Pay safely with PayPal** → log in with the sandbox buyer.
3. You're redirected back with "Payment done". The capture is stored and chained.

PayPal doesn't take PKR, AED, SAR or INR, so those prices are converted to USD using `FX_TO_USD` (approximate demo rates, update before demo day).

### WhatsApp (Twilio sandbox, free)

People forward a seller's message, screenshot or voice note to a WhatsApp number and get the verdict back in the same chat, in their language.

1. Run `supabase/migrations/0002_whatsapp.sql` in the Supabase SQL Editor.
2. Create a free Twilio account → **Messaging → Try it out → Send a WhatsApp message**. Join the sandbox from your phone by sending the `join <word>` code it shows to **+1 415 523 8886**.
3. Put `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (Console home page) in `.env.local`.
4. Give Twilio a public URL:
   - **Deployed:** `https://your-app.vercel.app/api/whatsapp`
   - **Local:** `npx ngrok http 3000` → `https://<id>.ngrok-free.app/api/whatsapp`
5. Paste that URL into the sandbox settings, **When a message comes in**, method **POST**. Put the same URL in `TWILIO_WEBHOOK_URL`, restart `npm run dev`.
6. Send the bot a message from your phone.

What it understands:

| Send | Bharosa replies |
|---|---|
| Seller's text or a link | 🔴/🟡/🟢 verdict, reason, warning signs, PayPal pay link if safe |
| Chat screenshot | Same, read by the AI |
| Voice note (Urdu, English, Arabic) | Shows what it heard, then the verdict |
| `WHY` / `kyun` | Every check with its evidence |
| `REPORT` | Reports the last seller to the community network |
| `hi` / `salam` / `help` | How to use it |

Replies come in English, Urdu, Roman Urdu or Arabic, matching the sender. Twilio waits only 15 seconds for a reply, so if a check is slow Bharosa answers "checking..." and sends the verdict as a follow-up message.

**Test without a phone:** with `npm run dev` running and any `TWILIO_AUTH_TOKEN` set,

```bash
npm run wa -- "Bhai PS5 sirf 45k, pehle advance JazzCash pe bhejo, COD nahi hai"
npm run wa -- WHY
npm run wa -- REPORT
```

The simulator signs its requests exactly like Twilio, so it exercises the real security check.

## Tests

```bash
npm test                # 32 offline tests: rules, verdicts, hash chain, privacy, SSRF, WhatsApp. No keys, no network.
npm run dev             # then in a second terminal:
npm run test:fixtures   # runs the 4 demo cases through the real API and prints verdicts
```

## How a check works

```
input (text / link / screenshot)
  → extract     Gemini reads it (vision for screenshots) + rule-based extraction merged in
  → signals     9 independent checks, each fails safe to "unknown"
  → verdict     fixed rules: any danger = red, 2+ warnings = yellow, nothing known = yellow
  → explain     one sentence in the user's language (AI, with built-in templates as fallback)
  → save        Supabase row + hash-chain entry
  → pay         PayPal order for green/yellow only
```

| Signal | Red when | Yellow when |
|---|---|---|
| Price | >60% below market | >40% below market |
| Payment method | crypto, gift cards, Western Union, or refuses protection | direct transfer only, friends & family |
| Crypto wallet | a BTC / ETH / TRON address is in the message | |
| Fake brand | domain imitates a known brand (apple-store-pk.shop, paypa1.com) | handle like @apple_official_store |
| Website | on Google Safe Browsing, or registered <7 days ago | registered <30 days ago |
| Community reports | 3+ people reported this seller | 1–2 reports |
| Advance payment | | wants money first, unprotected |
| Pressure | | "only today", "5 people waiting", "jaldi karo" |
| Account age | | seller account <30 days old |

All rules live in `lib/check/`. The web page and WhatsApp (`lib/channels/whatsapp/`) both call the same `runCheck()`.

## Security

- **Hash chain** (`lib/ledger.ts`, `append_ledger()` in SQL): `entry_hash = sha256(prev_hash | seq | kind | payload_hash | time)`. Appends are serialized with a lock, the table blocks UPDATE/DELETE with a trigger, and `GET /api/ledger/verify` re-walks the chain and re-hashes every stored check and report. Edit or delete any record and verification fails at that entry.
- **Privacy:** phones, handles and reporter IPs are stored as HMAC-SHA256 fingerprints with `HASH_SALT`. Phone formats are normalized so `+92 300 1234567` and `03001234567` match.
- **Report abuse protection:** you can only report a seller from a real stored check, one report per person per seller, max 5 reports/hour per IP. Counts use distinct reporters.
- **SSRF protection** for image links: https only, port 443, every resolved IP must be public, redirects re-checked, 5 MB cap, image types only.
- **Rate limits:** 10 checks/minute per IP (in-memory; move to Redis or a table for multi-instance production).
- **Row-level security** on all tables with no public policies. Only the server's service role key can read or write.
- Input size limits and schema validation on every endpoint.
- **WhatsApp webhook:** every request must carry a valid Twilio signature (HMAC-SHA1, constant-time compare) or it gets 403. Media is only downloaded from `api.twilio.com`. Duplicate deliveries are ignored, each sender is rate-limited (6 checks/minute, 5 reports/hour), and sender numbers are stored only as fingerprints.

Known limitations: the DNS check in the image fetcher has a small DNS-rebinding window; the in-memory rate limiter resets on redeploy; market prices are AI estimates and marked as such in the UI.

## Roadmap

- ~~**Phase 2:** WhatsApp via Twilio sandbox, voice notes, reply in the user's language~~ done
- **Phase 3:** publish the hash chain's head on a public testnet so the history can't be rewritten even by us, PayPal webhook signature verification, judge-facing demo page
