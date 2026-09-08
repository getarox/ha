import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatWithAurevion, isAllowedAurevionOrigin, isAuthorizedAurevionClient } from "./aurevion.js";
import { runImageStudio } from "./imageStudio.js";
import { createPayTabsPayment, getWallet, settlePayTabsCallback, verifyPayTabsCallback } from "./billing.js";

export function health(_req: VercelRequest, res: VercelResponse) { return res.status(200).json({ ok: true, service: "aurevion-vercel-api", cloud_fallback: "groq" }); }
function cors(req: VercelRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!isAllowedAurevionOrigin(origin)) return false;
  if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-AUREVION-CLIENT-KEY"); res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); return true;
}
export async function chat(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." }); if (req.method === "OPTIONS") return res.status(204).end(); if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  const key = typeof req.headers["x-aurevion-client-key"] === "string" ? req.headers["x-aurevion-client-key"] : undefined; if (!isAuthorizedAurevionClient(key)) return res.status(401).json({ error: "عميل أوريفون غير مصرح." });
  const body = req.body || {}; if (typeof body.sessionId !== "string" || !Array.isArray(body.messages) || body.messages.length < 1) return res.status(400).json({ error: "بيانات المحادثة غير صالحة." });
  try { return res.status(200).json(await chatWithAurevion(body)); } catch (error: any) { const code = error?.code; const status = code === "TOO_MANY_REQUESTS" ? 429 : code === "FORBIDDEN" ? 403 : code === "PAYMENT_REQUIRED" ? 402 : code === "PRECONDITION_FAILED" ? 503 : 502; return res.status(status).json({ error: error?.message || "تعذر الحصول على رد من أوريفون الآن." }); }
}
export async function image(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const body = req.body || {};
  if (typeof body.sessionId !== "string" || typeof body.mode !== "string" || typeof body.prompt !== "string") return res.status(400).json({ error: "بيانات عملية الصورة غير صالحة." });
  if (!["generate", "edit", "analyze", "evaluate"].includes(body.mode)) return res.status(400).json({ error: "وضع الصورة غير صالح." });
  try { return res.status(200).json(await runImageStudio({ sessionId: body.sessionId, mode: body.mode, prompt: body.prompt, imageBase64: typeof body.imageBase64 === "string" ? body.imageBase64 : undefined, mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined, pro: Boolean(body.pro) })); } catch (error: any) { const code = error?.code; const status = code === "TOO_MANY_REQUESTS" ? 429 : code === "FORBIDDEN" ? 403 : code === "PAYMENT_REQUIRED" ? 402 : code === "PRECONDITION_FAILED" ? 503 : code === "BAD_REQUEST" ? 400 : 502; return res.status(status).json({ error: error?.message || "تعذر تنفيذ عملية الصور حاليًا." }); }
}
export async function wallet(req: VercelRequest, res: VercelResponse) { if (req.method !== "GET") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : ""; if (sessionId.length < 8) return res.status(400).json({ error: "sessionId غير صالح." }); return res.status(200).json(await getWallet(sessionId)); }
export async function paymentCreate(req: VercelRequest, res: VercelResponse) { if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const b = req.body ?? {}; if (typeof b.sessionId !== "string" || typeof b.amount !== "number") return res.status(400).json({ error: "sessionId و amount مطلوبان." }); try { return res.status(200).json(await createPayTabsPayment({ sessionKey: b.sessionId, amount: b.amount, description: b.description, customer: b.customer })); } catch (e: any) { return res.status(400).json({ error: e?.message ?? "تعذر إنشاء عملية الدفع." }); } }
function raw(req: VercelRequest) { const body = (req as any).rawBody; return Buffer.isBuffer(body) ? body.toString("utf8") : typeof body === "string" ? body : JSON.stringify(req.body ?? {}); }
export async function paymentCallback(req: VercelRequest, res: VercelResponse) { if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." }); const sig = req.headers.signature ?? req.headers["x-signature"]; const signature = Array.isArray(sig) ? sig[0] : sig; if (!verifyPayTabsCallback(raw(req), signature)) return res.status(401).json({ error: "توقيع PayTabs غير صالح." }); try { return res.status(200).json(await settlePayTabsCallback(req.body ?? {})); } catch (e: any) { return res.status(400).json({ error: e?.message ?? "تعذر معالجة callback." }); } }
export async function paymentReturn(_req: VercelRequest, res: VercelResponse) { return res.status(200).json({ ok: true, message: "تم استلام نتيجة الدفع. سيتم تحديث الرصيد عبر callback الآمن." }); }
