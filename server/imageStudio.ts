import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env.js";
import { createAurevionSession, getAurevionSession, updateAurevionSession } from "./db.js";
import { chargeUsage } from "./billing.js";

export type ImageStudioMode = "generate" | "edit" | "analyze" | "evaluate";

type ImageStudioInput = {
  sessionId: string;
  mode: ImageStudioMode;
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  pro?: boolean;
};

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const memoryImageUsage = new Map<string, { plan: "free" | "pro"; imagesUsed: number }>();

function cleanSessionId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128);
}

function getMemoryState(sessionId: string) {
  const existing = memoryImageUsage.get(sessionId);
  if (existing) return existing;
  const state = { plan: "free" as const, imagesUsed: 0 };
  memoryImageUsage.set(sessionId, state);
  return state;
}

async function ensureSession(sessionId: string) {
  const clean = cleanSessionId(sessionId);
  if (clean.length < 8) throw new TRPCError({ code: "BAD_REQUEST", message: "معرّف الجلسة غير صالح." });
  if (process.env.DATABASE_URL) {
    let session = await getAurevionSession(clean);
    if (!session) {
      await createAurevionSession(clean);
      session = await getAurevionSession(clean);
    }
    return session;
  }
  return undefined;
}

async function checkImageQuota(sessionId: string, requestedPro: boolean) {
  const persisted = await ensureSession(sessionId);
  const memory = getMemoryState(cleanSessionId(sessionId));
  const plan = persisted?.plan ?? memory.plan;
  if (requestedPro && plan !== "pro") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ميزة Pro تحتاج خطة احترافية مفعّلة." });
  }
  const limit = plan === "pro" ? ENV.proImageLimit : ENV.freeImageLimit;
  const used = persisted?.imagesUsed ?? memory.imagesUsed;
  if (used >= limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `انتهت حصة الصور لهذه الخطة (${limit}).` });
  }
  return { plan, used, limit, persisted };
}

async function consumeImageQuota(sessionId: string, quota: Awaited<ReturnType<typeof checkImageQuota>>) {
  const next = quota.used + 1;
  const memory = getMemoryState(cleanSessionId(sessionId));
  memory.plan = quota.plan;
  memory.imagesUsed = next;
  if (quota.persisted) await updateAurevionSession(quota.persisted.id, { imagesUsed: next });
  return { plan: quota.plan, remaining: Math.max(0, quota.limit - next) };
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,([\s\S]+)$/);
  return match ? { mimeType: match[1], data: match[2] } : { mimeType: "image/png", data: value };
}

async function callGeminiImage(input: ImageStudioInput, model: string) {
  if (!ENV.geminiApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "خدمة الصور غير مفعّلة على الخادم." });
  const parts: GeminiPart[] = [{ text: input.prompt }];
  if (input.imageBase64) {
    const decoded = decodeDataUrl(input.imageBase64);
    parts.push({ inlineData: { mimeType: input.mimeType ?? decoded.mimeType, data: decoded.data } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(ENV.geminiApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    await response.text();
    console.error("[ImageStudio] Gemini request failed", response.status);
    throw new TRPCError({ code: response.status === 404 ? "NOT_FOUND" : "BAD_GATEWAY", message: "تعذر تنفيذ عملية الصور حاليًا." });
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }> };
  const outputParts = payload.candidates?.[0]?.content?.parts ?? [];
  const image = outputParts.find((part) => part.inlineData?.data);
  const text = outputParts.find((part) => part.text)?.text ?? "تم تنفيذ عملية الصور.";
  return { kind: "image" as const, text, imageDataUrl: image?.inlineData?.data ? `data:${image.inlineData.mimeType ?? "image/png"};base64,${image.inlineData.data}` : undefined };
}

async function callGroqVision(input: ImageStudioInput, model: string) {
  if (!ENV.groqApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "خدمة التحليل غير مفعّلة على الخادم." });
  if (!input.imageBase64) throw new TRPCError({ code: "BAD_REQUEST", message: "أرفق صورة للتحليل أو التقييم." });
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.groqApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, { type: "image_url", image_url: { url: input.imageBase64 } }] }], max_completion_tokens: 900 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "تعذر تحليل الصورة حاليًا." });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return { kind: "text" as const, text: payload.choices?.[0]?.message?.content ?? "لم أستطع استخراج تقييم من الصورة." };
}

async function enhanceImagePrompt(prompt: string) {
  if (!ENV.groqApiKey || process.env.NODE_ENV === "test") return prompt;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.groqApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: ENV.groqModel, temperature: 0.35, max_tokens: 700, messages: [
        { role: "system", content: "You are a professional image prompt engineer. Rewrite the user's request into one precise, vivid English prompt for an image generator. Preserve every requested subject, action, setting, culture, and mood. Never add people, genders, text, logos, or objects that were not requested. If the subject is a cat, explicitly say cat, never scene or woman. Return only the final prompt, no explanation." },
        { role: "user", content: prompt },
      ] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return prompt;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const enhanced = payload.choices?.[0]?.message?.content?.trim();
    return enhanced && enhanced.length >= 10 && enhanced.length <= 4000 ? enhanced : prompt;
  } catch (error) {
    console.warn("[ImageStudio] Prompt enhancement unavailable; using original prompt", error);
    return prompt;
  }
}

async function callPollinationsImage(input: ImageStudioInput) {
  const endpoint = ENV.pollinationsEndpoint.replace(/\/+$/, "");
  const clarifiedPrompt = /لقطة|قطه/i.test(input.prompt)
    ? `${input.prompt.replace(/لقطة|قطه/gi, "قطة")}، قطة حقيقية نائمة بوضوح، بدون أي أشخاص أو نساء أو وجوه بشرية`
    : input.prompt;
  const prompt = await enhanceImagePrompt(clarifiedPrompt);
  const url = `${endpoint}/${encodeURIComponent(prompt)}?model=${encodeURIComponent(ENV.pollinationsModel)}&nologo=true`;
  return { kind: "image" as const, text: "تم إنشاء الصورة عبر Pollinations AI.", imageDataUrl: url };
}

export function getImageStudioModel(mode: ImageStudioMode, pro: boolean) {
  if (mode === "analyze" || mode === "evaluate") return pro ? ENV.groqProVisionModel : ENV.groqVisionModel;
  return pro ? ENV.geminiProImageModel : ENV.geminiImageModel;
}

export async function runImageStudio(input: ImageStudioInput) {
  if (input.prompt.trim().length < 2 || input.prompt.length > 4000) throw new TRPCError({ code: "BAD_REQUEST", message: "وصف الصورة غير صالح." });
  if (input.imageBase64) {
    if (input.imageBase64.length > 6_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الصورة كبير جدًا. استخدم صورة أقل من 4MB." });
    if (input.mimeType && !["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الصورة غير مدعوم." });
  }
  const quotaCheck = await checkImageQuota(input.sessionId, Boolean(input.pro));
  const model = getImageStudioModel(input.mode, Boolean(input.pro));
  let provider = "groq";
  let result;
  if (input.mode === "analyze" || input.mode === "evaluate") {
    result = await callGroqVision(input, model);
  } else if (input.mode === "generate" && !input.pro) {
    result = await callPollinationsImage(input); provider = "pollinations";
  } else {
    result = await callGeminiImage(input, model); provider = "gemini";
  }
  const isHeavyTask = input.mode !== "generate" || Boolean(input.pro);
  const requiresWalletCharge = provider !== "pollinations" && (ENV.walletEnforce || isHeavyTask);
  if (requiresWalletCharge && process.env.NODE_ENV !== "test") {
    try { await chargeUsage(input.sessionId, "image", provider, model, randomUUID()); }
    catch { throw new TRPCError({ code: "PAYMENT_REQUIRED", message: "رصيد المحفظة غير كافٍ." }); }
  }
  const quota = await consumeImageQuota(input.sessionId, quotaCheck);
  return { ...result, provider, plan: quota.plan, remaining: quota.remaining, model: provider === "pollinations" ? "pollinations.ai" : model };
}
