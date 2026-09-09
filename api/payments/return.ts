import type { VercelRequest, VercelResponse } from "@vercel/node";
import { paymentReturn } from "../../server/httpHandlers.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return paymentReturn(req, res);
}
