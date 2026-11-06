import type { VercelRequest, VercelResponse } from "@vercel/node";
import { paymentCallback } from "../../../server/httpHandlers";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return paymentCallback(req, res);
}
