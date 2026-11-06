import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../server/routers.js";
import { createContext } from "../../server/_core/context.js";

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ limit: "12mb", extended: true }));
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
