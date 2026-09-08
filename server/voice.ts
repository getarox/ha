import { ENV } from "./_core/env.js";

export const VOICE_PRESETS = {
  female: { label: "أنثى عربية", voiceId: process.env.ELEVENLABS_VOICE_FEMALE ?? "EXAVITQu4vr4xnSDxMaL" },
  male: { label: "ذكر عربي", voiceId: process.env.ELEVENLABS_VOICE_MALE ?? "JBFqnCBsd6RMkjVDRZzb" },
  calm: { label: "هادئ", voiceId: process.env.ELEVENLABS_VOICE_CALM ?? "Xb7hH8MSUJpSbSDYk0k2" },
};

export async function synthesizeVoice(text: string, voiceId?: string) {
  if (!ENV.elevenLabsApiKey) throw new Error("خدمة الصوت غير مفعّلة على الخادم.");
  const selected = voiceId === "male" ? VOICE_PRESETS.male.voiceId : voiceId === "calm" ? VOICE_PRESETS.calm.voiceId : voiceId === "female" ? VOICE_PRESETS.female.voiceId : voiceId || VOICE_PRESETS.female.voiceId;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(selected)}`, {
    method: "POST",
    headers: { "xi-api-key": ENV.elevenLabsApiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: text.slice(0, 5000), model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.75 } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error("تعذر توليد الصوت حاليًا.");
  return { contentType: "audio/mpeg", audioBase64: Buffer.from(await response.arrayBuffer()).toString("base64"), voiceId: selected };
}
