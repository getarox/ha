import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runImageStudio } from "../server/imageStudio.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "الطريقة غير مسموحة." });
  const body = req.body || {};
  if (typeof body.sessionId !== "string" || typeof body.mode !== "string" || typeof body.prompt !== "string") {
    return res.status(400).json({ error: "بيانات عملية الصورة غير صالحة." });
  }
  if (!["generate", "edit", "analyze", "evaluate"].includes(body.mode)) {
    return res.status(400).json({ error: "وضع الصورة غير صالح." });
  }
  try {
    return res.status(200).json(await runImageStudio({
      sessionId: body.sessionId,
      mode: body.mode,
      prompt: body.prompt,
      imageBase64: typeof body.imageBase64 === "string" ? body.imageBase64 : undefined,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
      pro: Boolean(body.pro),
    }));
  } catch (error: any) {
    const code = error?.code;
    const status = code === "TOO_MANY_REQUESTS" ? 429 : code === "FORBIDDEN" ? 403 : code === "PAYMENT_REQUIRED" ? 402 : code === "PRECONDITION_FAILED" ? 503 : code === "BAD_REQUEST" ? 400 : 502;
    return res.status(status).json({ error: error?.message || "تعذر تنفيذ عملية الصور حاليًا." });
  }
}
