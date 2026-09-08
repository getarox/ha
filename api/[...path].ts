import type { VercelRequest, VercelResponse } from "@vercel/node";

let appPromise: Promise<any> | undefined;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = String(req.url ?? "").split("?")[0].replace(/\/$/, "");
  if (path === "/api/health" || path === "/api/aurevion/health") {
    return res.status(200).json({ ok: true, service: "aurevion-vercel-api", cloud_fallback: "groq" });
  }
  const handlers = await import("../server/httpHandlers.js");
  if (path === "/api/voice") return handlers.voice(req, res);
  if (path === "/api/transcribe") return handlers.transcribe(req, res);
  if (path === "/api/chat") return handlers.chat(req, res);
  if (path === "/api/image") return handlers.image(req, res);
  if (path === "/api/wallet") return handlers.wallet(req, res);
  if (path === "/api/payments/create") return handlers.paymentCreate(req, res);
  if (path === "/api/payments/callback") return handlers.paymentCallback(req, res);
  if (path === "/api/payments/return") return handlers.paymentReturn(req, res);
  appPromise ??= import("../server/_core/index.js").then(({ createApp }) => createApp());
  return (await appPromise)(req, res);
}
