import { createApp } from "../server/_core/index.js";
import { chat, health, image, paymentCallback, paymentCreate, paymentReturn, wallet } from "../server/httpHandlers.js";

let appPromise: ReturnType<typeof createApp> | undefined;
export default async function handler(req: any, res: any) {
  const path = String(req.url ?? "").split("?")[0].replace(/\/$/, "");
  if (path === "/api/health" || path === "/api/aurevion/health") return health(req, res);
  if (path === "/api/chat") return chat(req, res);
  if (path === "/api/image") return image(req, res);
  if (path === "/api/wallet") return wallet(req, res);
  if (path === "/api/payments/create") return paymentCreate(req, res);
  if (path === "/api/payments/callback") return paymentCallback(req, res);
  if (path === "/api/payments/return") return paymentReturn(req, res);
  appPromise ??= createApp();
  return (await appPromise)(req, res);
}
