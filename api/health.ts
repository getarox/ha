import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true, service: "aurevion-vercel-api", release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", cloud_fallback: "groq" });
}
