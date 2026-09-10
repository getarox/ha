import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatWithAurevion, isAllowedAurevionOrigin, isAuthorizedAurevionClient } from "./aurevion.js";
import { runImageStudio } from "./imageStudio.js";
import { createPayTabsPayment, getWallet, settlePayTabsCallback, verifyPayTabsCallback } from "./billing.js";
import { synthesizeVoice } from "./voice.js";
import { transcribeAudio } from "./transcribe.js";
import { createAurevionFeedback } from "./db.js";
import { resolveServerImageIntent } from "./imageIntent.js";

const requestWindows = new Map<string, { started: number; count: number }>();
function allowRequest(req: VercelRequest, bucket: string, limit: number) {
  const address = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0] : "unknown";
  const key = `${bucket}:${address}`;
  const now = Date.now(); const current = requestWindows.get(key);
  if (!current || now - current.started >= 60_000) { requestWindows.set(key, { started: now, count: 1 }); return true; }
  if (current.count >= limit) return false;
  current.count += 1; return true;
}
function rateLimited(req: VercelRequest, res: VercelResponse, bucket: string, limit: number) { if (allowRequest(req, bucket, limit)) return false; res.setHeader("Retry-After", "60"); res.status(429).json({ error: "طلبات كثيرة جدًا. حاول بعد دقيقة." }); return true; }

export function health(_req: VercelRequest, res: VercelResponse) { return res.status(200).json({ ok: true, service: "aurevion-vercel-api", cloud_fallback: "groq" }); }
function cors(req: VercelRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const host = typeof req.headers.host === "string" ? req.headers.host : "";
  const sameOrigin = !origin || origin === `https://${host}` || origin === `http://${host}`;
  if (!sameOrigin && !isAllowedAurevionOrigin(origin)) return false;
  if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-AUREVION-CLIENT-KEY"); res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); return true;
}
export async function chat(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." }); if (req.method === "OPTIONS") return res.status(204).end(); if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  if (rateLimited(req, res, "chat", 60)) return;
  const key = typeof req.headers["x-aurevion-client-key"] === "string" ? req.headers["x-aurevion-client-key"] : undefined;
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const host = typeof req.headers.host === "string" ? req.headers.host : "";
  const sameOrigin = !origin || origin === `https://${host}` || origin === `http://${host}`;
  if (!sameOrigin && !isAuthorizedAurevionClient(key)) return res.status(401).json({ error: "عميل أوريفون غير مصرح." });
  const body = req.body || {}; if (typeof body.sessionId !== "string" || !Array.isArray(body.messages) || body.messages.length < 1) return res.status(400).json({ error: "بيانات المحادثة غير صالحة." });
  try {
    const latest = body.messages[body.messages.length - 1];
    const prompt = latest && typeof latest.content === "string" ? latest.content : "";
    const imageMode = resolveServerImageIntent(prompt, typeof body.imageBase64 === "string");
    if (imageMode) {
      const result = await runImageStudio({ sessionId: body.sessionId, mode: imageMode, prompt, imageBase64: typeof body.imageBase64 === "string" ? body.imageBase64 : undefined, mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined, pro: Boolean(body.pro) });
      return res.status(200).json({ ...result, reply: result.text, imageUrl: "imageDataUrl" in result ? result.imageDataUrl : undefined });
    }
    return res.status(200).json(await chatWithAurevion(body));
  } catch (error: any) { const code = error?.code; const status = code === "TOO_MANY_REQUESTS" ? 429 : code === "FORBIDDEN" ? 403 : code === "PAYMENT_REQUIRED" ? 402 : code === "PRECONDITION_FAILED" ? 503 : code === "BAD_REQUEST" ? 400 : 502; return res.status(status).json({ error: error?.message || "تعذر الحصول على رد من أوريفون الآن." }); }
}
export async function image(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." }); if (req.method === "OPTIONS") return res.status(204).end(); if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const body = req.body || {};
  if (rateLimited(req, res, "image", 20)) return;
  if (typeof body.sessionId !== "string" || typeof body.mode !== "string" || typeof body.prompt !== "string") return res.status(400).json({ error: "بيانات عملية الصورة غير صالحة." });
  if (!["generate", "edit", "analyze", "evaluate"].includes(body.mode)) return res.status(400).json({ error: "وضع الصورة غير صالح." });
  try { return res.status(200).json(await runImageStudio({ sessionId: body.sessionId, mode: body.mode, prompt: body.prompt, imageBase64: typeof body.imageBase64 === "string" ? body.imageBase64 : undefined, mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined, pro: Boolean(body.pro) })); } catch (error: any) { const code = error?.code; const status = code === "TOO_MANY_REQUESTS" ? 429 : code === "FORBIDDEN" ? 403 : code === "PAYMENT_REQUIRED" ? 402 : code === "PRECONDITION_FAILED" ? 503 : code === "BAD_REQUEST" ? 400 : 502; return res.status(status).json({ error: error?.message || "تعذر تنفيذ عملية الصور حاليًا." }); }
}
export async function wallet(req: VercelRequest, res: VercelResponse) { if (req.method !== "GET") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : ""; if (sessionId.length < 8) return res.status(400).json({ error: "sessionId غير صالح." }); try { return res.status(200).json(await getWallet(sessionId)); } catch (error) { console.error("[Wallet] Database failure", error); return res.status(503).json({ error: "خدمة المحفظة غير متاحة حاليًا.", code: "DATABASE_UNAVAILABLE" }); } }
export async function paymentCreate(req: VercelRequest, res: VercelResponse) { if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." }); if (rateLimited(req, res, "payment-create", 5)) return; const b = req.body ?? {}; if (typeof b.sessionId !== "string" || b.sessionId.length < 8 || b.sessionId.length > 128 || typeof b.amount !== "number") return res.status(400).json({ error: "بيانات الدفع غير صالحة." }); try { return res.status(200).json(await createPayTabsPayment({ sessionKey: b.sessionId, amount: b.amount, description: typeof b.description === "string" ? b.description.slice(0, 255) : undefined, customer: b.customer })); } catch (e: any) { return res.status(400).json({ error: e?.message ?? "تعذر إنشاء عملية الدفع." }); } }
function raw(req: VercelRequest) { const body = (req as any).rawBody; return Buffer.isBuffer(body) ? body.toString("utf8") : typeof body === "string" ? body : JSON.stringify(req.body ?? {}); }
export async function paymentCallback(req: VercelRequest, res: VercelResponse) { if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const sig = req.headers.signature ?? req.headers["x-signature"]; const signature = Array.isArray(sig) ? sig[0] : sig; if (!verifyPayTabsCallback(raw(req), signature)) return res.status(401).json({ error: "توقيع PayTabs غير صالح." }); try { return res.status(200).json(await settlePayTabsCallback(req.body ?? {})); } catch (e: any) { return res.status(400).json({ error: e?.message ?? "تعذر معالجة callback." }); } }
export async function paymentReturn(_req: VercelRequest, res: VercelResponse) { return res.status(200).json({ ok: true, message: "تم استلام نتيجة الدفع. سيتم تحديث الرصيد عبر callback الآمن." }); }
export async function voice(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." }); if (req.method === "OPTIONS") return res.status(204).end(); if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  if (rateLimited(req, res, "voice", 20)) return;
  const body = req.body ?? {};
  if (typeof body.text !== "string" || !body.text.trim()) return res.status(400).json({ error: "النص الصوتي مطلوب." });
  const voiceId = body.voiceId === "male" || body.voiceId === "calm" || body.voiceId === "female" ? undefined : typeof body.voiceId === "string" ? body.voiceId : undefined;
  const preset = body.voiceId === "male" || body.voiceId === "calm" || body.voiceId === "female" ? body.voiceId : undefined;
  try { return res.status(200).json(await synthesizeVoice(body.text, preset ?? voiceId)); }
  catch (error: any) { return res.status(502).json({ error: error?.message ?? "تعذر توليد الصوت حاليًا." }); }
}
export async function transcribe(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." }); if (req.method === "OPTIONS") return res.status(204).end(); if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  if (rateLimited(req, res, "transcribe", 20)) return;
  const body = req.body ?? {};
  if (typeof body.audioBase64 !== "string") return res.status(400).json({ error: "التسجيل الصوتي مطلوب." });
  try { return res.status(200).json(await transcribeAudio(body.audioBase64, typeof body.mimeType === "string" ? body.mimeType : "audio/webm")); }
  catch (error: any) { return res.status(502).json({ error: error?.message ?? "تعذر تحويل التسجيل إلى نص." }); }
}

export async function feedback(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  if (rateLimited(req, res, "feedback", 5)) return;
  const body = req.body ?? {};
  const category = body.category;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!["support", "bug", "safety", "feedback"].includes(category) || message.length < 3 || message.length > 10000) {
    return res.status(400).json({ error: "نوع البلاغ أو نصه غير صالح." });
  }
  try {
    const saved = await createAurevionFeedback({
      category,
      message,
      sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 128) : null,
      userEmail: typeof body.userEmail === "string" ? body.userEmail.slice(0, 320) : null,
    });
    return res.status(201).json({ ok: true, ...saved, message: "تم استلام البلاغ وسيتم التعامل معه." });
  } catch (error: any) {
    if (error?.message === "DATABASE_UNAVAILABLE") return res.status(503).json({ error: "خدمة العملاء غير متصلة بقاعدة البيانات حاليًا." });
    console.error("[Feedback] Failed to save feedback:", error);
    return res.status(503).json({ error: "تعذر حفظ البلاغ حاليًا. حاول مرة أخرى." });
  }
}
