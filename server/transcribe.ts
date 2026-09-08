import { ENV } from "./_core/env.js";

export async function transcribeAudio(audioBase64: string, mimeType = "audio/webm") {
  if (!ENV.groqApiKey) throw new Error("خادم Groq غير مهيأ بعد.");
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(audioBase64, "base64")], { type: mimeType }), "recording.webm");
  form.append("model", process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo");
  form.append("language", "ar");
  form.append("response_format", "json");
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${ENV.groqApiKey}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "تعذر تحويل التسجيل إلى نص.");
  return { text: typeof data.text === "string" ? data.text.trim() : "" };
}
