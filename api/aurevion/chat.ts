import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chat } from "../../server/httpHandlers.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return chat(req, res);
}
