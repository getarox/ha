import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatWithAurevion, isAllowedAurevionOrigin, isAuthorizedAurevionClient } from "../server/aurevion";

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!isAllowedAurevionOrigin(origin)) return false;
  if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-AUREVION-CLIENT-KEY");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  const clientKey = typeof req.headers["x-aurevion-client-key"] === "string" ? req.headers["x-aurevion-client-key"] : undefined;
  if (!isAuthorizedAurevionClient(clientKey)) return res.status(401).json({ error: "عميل أوريفون غير مصرح." });
  const body = req.body || {};
  if (typeof body.sessionId !== "string" || !Array.isArray(body.messages) || body.messages.length < 1) {
    return res.status(400).json({ error: "بيانات المحادثة غير صالحة." });
  }
  try {
    return res.status(200).json(await chatWithAurevion(body));
  } catch (error: any) {
    const code = error?.code;
    const status = code === "TOO_MANY_REQUESTS" ? 429 : code === "FORBIDDEN" ? 403 : code === "PRECONDITION_FAILED" ? 503 : 502;
    return res.status(status).json({ error: error?.message || "تعذر الحصول على رد من أوريفون الآن." });
  }
}
