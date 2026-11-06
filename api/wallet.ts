import type { VercelRequest, VercelResponse } from "@vercel/node";
import { wallet } from "../server/httpHandlers";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return wallet(req, res);
}
