/**
 * Vercel serverless function — /api/transcribe
 *
 * Receives a short audio recording (voice dictation for the insulation
 * estimate) and transcribes it via OpenAI's speech-to-text. This replaces
 * relying on the browser's own SpeechRecognition engine, which turned out
 * to be unreliable across iOS Safari and Android Chrome - the browser's
 * only job now is recording a plain audio clip (much better supported
 * everywhere than full speech recognition), and this function does the
 * actual transcription server-side.
 *
 * Requires OPENAI_API_KEY in Vercel environment variables. The key never
 * reaches the browser - only this server-side function ever sees it.
 */
import OpenAI, { toFile } from "openai";
import formidable from "formidable";
import fs from "fs/promises";

// Public values (same ones the app itself ships with) - used only to ask
// Supabase "is this login token real?".
const SUPABASE_URL = "https://ackhjqsiwbxupldwjcvj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzAxMzAsImV4cCI6MjA5NTAwNjEzMH0.FiT5M0DIBP2GgK2rR-dZviFf9CSkZohyfmY_jirDebs";

export const config = {
  api: {
    bodyParser: false, // formidable needs the raw multipart body, not pre-parsed JSON
  },
};

export default async function handler(req, res) {
  // Same-origin only: the app calls this from its own domain, so no CORS
  // headers are sent (browsers on other websites are blocked).
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // Must be a logged-in user of the app - checked against Supabase.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please log in again." });
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!who.ok) return res.status(401).json({ error: "Please log in again." });
  } catch {
    return res.status(401).json({ error: "Could not verify your login." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY not configured on Vercel" });

  try {
    const form = formidable({ maxFileSize: 25 * 1024 * 1024, keepExtensions: true });
    const [, files] = await form.parse(req);

    const uploaded = files.audio?.[0];
    if (!uploaded) return res.status(400).json({ error: "No audio file received" });

    const audioBuffer = await fs.readFile(uploaded.filepath);
    const openai = new OpenAI({ apiKey });

    const audioFile = await toFile(
      audioBuffer,
      uploaded.originalFilename || "recording.webm",
      { type: uploaded.mimetype || "audio/webm" }
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      language: "en",
    });

    return res.status(200).json({ text: transcription.text || "" });
  } catch (error) {
    console.error("Transcription error:", error);
    return res.status(500).json({ error: error?.message || "Transcription failed" });
  }
}
