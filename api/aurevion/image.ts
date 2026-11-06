import type { VercelRequest, VercelResponse } from "@vercel/node";
import { image } from "../../server/httpHandlers";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return image(req, res);
}
