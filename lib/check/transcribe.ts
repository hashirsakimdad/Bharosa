import { z } from "zod";
import type { Lang } from "../types";
import { generate, geminiConfigured, parseJsonReply } from "../llm/gemini";

/**
 * Voice notes -> text. Gemini listens to the audio directly (free tier),
 * so a WhatsApp voice note in Urdu, English, Punjabi-mixed Urdu or Arabic works.
 * The transcript then goes through the normal check.
 */

const AUDIO_TYPES = /^audio\/(ogg|opus|mpeg|mp3|mp4|m4a|aac|wav|x-wav|webm|amr|flac)$/;

export function isAudio(mimeType: string): boolean {
  return AUDIO_TYPES.test(mimeType.toLowerCase());
}

const Reply = z.object({
  transcript: z.string().catch(""),
  language: z.enum(["en", "ur", "roman_ur", "ar"]).catch("en"),
});

export async function transcribe(audio: { mimeType: string; data: string }): Promise<{ text: string; language: Lang }> {
  if (!geminiConfigured()) throw new Error("Voice notes need the AI (GEMINI_API_KEY).");
  // Gemini wants the bare type: "audio/ogg; codecs=opus" -> "audio/ogg"
  const mimeType = audio.mimeType.split(";")[0].trim().toLowerCase();

  const prompt = `This voice note was sent to a scam-checking service. Usually the person is describing a deal, reading out a seller's message, or forwarding a seller's own voice note.

Transcribe it exactly, keeping prices, phone numbers, account names, payment apps and links as spoken. Write numbers as digits.
If it's in Urdu, write the transcript in Roman Urdu (Urdu in English letters) so prices and app names stay readable.

Return JSON: {"transcript": string, "language": "en" | "ur" | "roman_ur" | "ar"}
"language" is the language the speaker used. Use "ur" for spoken Urdu, "ar" for Arabic, "en" for English.`;

  const raw = await generate(prompt, { images: [{ mimeType, data: audio.data }], json: true, timeoutMs: 20_000 });
  const parsed = Reply.parse(parseJsonReply(raw));
  if (!parsed.transcript.trim()) throw new Error("Couldn't hear anything in that voice note.");
  return { text: parsed.transcript.trim().slice(0, 6000), language: parsed.language };
}
