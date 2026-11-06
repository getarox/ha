import type { VercelRequest, VercelResponse } from "@vercel/node";
import { paymentCreate } from "../../server/httpHandlers";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return paymentCreate(req, res);
}
