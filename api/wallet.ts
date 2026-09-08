import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getWallet } from "../server/billing.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
  if (sessionId.length < 8) return res.status(400).json({ error: "sessionId غير صالح." });
  return res.status(200).json(await getWallet(sessionId));
}
