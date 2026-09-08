import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPayTabsPayment, settlePayTabsCallback, verifyPayTabsCallback } from "../../server/billing.js";

function rawBody(req: VercelRequest) {
  const raw = (req as any).rawBody;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (typeof raw === "string") return raw;
  return JSON.stringify(req.body ?? {});
}
function signature(req: VercelRequest) { const value = req.headers.signature ?? req.headers["x-signature"]; return Array.isArray(value) ? value[0] : value; }

export async function create(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  const body = req.body ?? {};
  if (typeof body.sessionId !== "string" || typeof body.amount !== "number") return res.status(400).json({ error: "sessionId و amount مطلوبان." });
  try { return res.status(200).json(await createPayTabsPayment({ sessionKey: body.sessionId, amount: body.amount, description: body.description, customer: body.customer })); }
  catch (error: any) { return res.status(400).json({ error: error?.message ?? "تعذر إنشاء الدفع." }); }
}

export async function callback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  const raw = rawBody(req);
  if (!verifyPayTabsCallback(raw, signature(req))) return res.status(401).json({ error: "توقيع PayTabs غير صالح." });
  try { return res.status(200).json(await settlePayTabsCallback(req.body ?? {})); }
  catch (error: any) { return res.status(400).json({ error: error?.message ?? "تعذر معالجة callback." }); }
}

export async function paymentReturn(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();
  return res.status(200).json({ ok: true, message: "تم استلام نتيجة الدفع. سيتم تحديث الرصيد عبر callback الآمن." });
}
