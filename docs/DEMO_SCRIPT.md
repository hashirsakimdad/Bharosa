# Bharosa: 3-minute demo video script

Record your phone screen (WhatsApp) and your laptop screen (web page and /proof). Keep it to 3 minutes. Judges skip ahead, so the scam catch has to land in the first 40 seconds.

Before recording:
- `supabase/setup.sql` has run, and all keys are set on Vercel
- your phone has joined the Twilio sandbox
- run 4 or 5 checks beforehand so /proof shows real numbers
- trigger one Bitcoin stamp beforehand (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/anchor`) so it has reached a block by recording time
- have these three messages ready to forward (they're also on the web page under "Try:"):
  1. the cheap iPhone paid in USDT
  2. the Roman Urdu PS5 seller
  3. the normal headphones sale, with `PayPal: <your sandbox business account email>` added to the end. PayPal sandbox only pays real sandbox accounts; with any other email the payment still works but goes through Bharosa instead of the seller.

---

## 0:00 to 0:20: the problem

Screen: an Instagram-style DM from a seller, "iPhone 15 Pro Max only $280, pay USDT, offer ends tonight".

Say:
"Most online buying here happens in DMs. The seller asks for money first, by bank transfer or crypto, and if the parcel never comes, the money is gone. Bharosa is a check you run before you pay."

## 0:20 to 0:50: catch the scam on WhatsApp

Screen: phone. Forward the iPhone message to Bharosa. The red reply appears.

Say:
"I forward it to Bharosa on WhatsApp. A few seconds later: don't pay. It wants crypto to a wallet address, and the website is pretending to be Apple."

Send `WHY`. Scroll the evidence slowly.

"Every answer shows its evidence. The AI reads the message, but fixed rules pick the color, so it can't talk itself into 'safe'."

## 0:50 to 1:20: Roman Urdu and voice

Screen: forward the PS5 message.

Say:
"Most people here don't write in English. This seller writes in Roman Urdu, and the answer comes back in Roman Urdu: paise mat bhejein, he wants an advance and refuses cash on delivery."

Optional: send a 5-second voice note reading part of it. Show the reply starting with "Main ne suna...".

Send `REPORT`.
"One word warns the next person who checks this seller."

## 1:20 to 2:05: the safe path, paid with PayPal

Screen: forward the headphones message. A green reply with a PayPal link.

Say:
"When it looks safe, Bharosa makes a PayPal checkout for the exact price. The seller gave a PayPal email, so the money goes straight to them, and I keep PayPal buyer protection. Red verdicts never get a pay link."

Tap the link. Pay with the sandbox buyer account. Show the "Payment done" screen.

"If the buyer opens a PayPal dispute later, Bharosa's webhook records it and counts it as a report against that seller."

## 2:05 to 2:40: proof nobody can quietly edit

Screen: laptop, open /proof.

Say:
"Every check, report and payment goes into a chain where each record locks in the one before it. Every day the newest link is stamped on Bitcoin."

Click "Download file" and "Download proof", then drop both onto opentimestamps.org. Show the Bitcoin block.

"So even I can't go back and change what Bharosa said about a seller."

## 2:40 to 3:00: close

Screen: the web page with a check result, then the GitHub repo.

Say:
"Bharosa runs on WhatsApp and on the web, works in four languages, and needs no app or sign-up. Forward it before you pay."

---

Tips:
- Don't show `.env.local` or the Vercel environment page on screen. It has your keys.
- If WhatsApp is slow during recording, use the web page. It runs the same check.
- Subtitles help. Many judges watch with the sound off.
