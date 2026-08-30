import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { chatWithAurevion, isAllowedAurevionOrigin, isAuthorizedAurevionClient } from "../aurevion";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  const chatBodySchema = z.object({
    sessionId: z.string().min(8).max(128),
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(8000),
    })).min(1).max(12),
    webSearch: z.boolean().optional().default(false),
  });

  const prepareAurevionCors = (req: express.Request, res: express.Response) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (!isAllowedAurevionOrigin(origin)) return false;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-AUREVION-CLIENT-KEY");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return true;
  };

  // Small REST contract for the future Android client. The Groq key never crosses this boundary.
  app.get("/api/aurevion/health", (req, res) => {
    if (!prepareAurevionCors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." });
    const clientKey = typeof req.headers["x-aurevion-client-key"] === "string" ? req.headers["x-aurevion-client-key"] : undefined;
    if (!isAuthorizedAurevionClient(clientKey)) return res.status(401).json({ error: "عميل أوريفون غير مصرح." });
    return res.json({ ok: true, service: "aurevion", timestamp: new Date().toISOString() });
  });
  app.options("/api/aurevion/chat", (req, res) => {
    if (!prepareAurevionCors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." });
    return res.sendStatus(204);
  });
  app.post("/api/aurevion/chat", async (req, res) => {
    if (!prepareAurevionCors(req, res)) return res.status(403).json({ error: "النطاق غير مصرح." });
    const clientKey = typeof req.headers["x-aurevion-client-key"] === "string" ? req.headers["x-aurevion-client-key"] : undefined;
    if (!isAuthorizedAurevionClient(clientKey)) return res.status(401).json({ error: "عميل أوريفون غير مصرح." });
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات المحادثة غير صالحة." });
    try {
      return res.json(await chatWithAurevion(parsed.data));
    } catch (error) {
      if (error instanceof TRPCError) {
        const status = error.code === "TOO_MANY_REQUESTS" ? 429 : error.code === "FORBIDDEN" ? 403 : error.code === "BAD_REQUEST" ? 400 : error.code === "PRECONDITION_FAILED" ? 503 : 502;
        return res.status(status).json({ error: error.message });
      }
      console.error("[AUREVION REST] Chat failed:", error);
      return res.status(502).json({ error: "تعذر الحصول على رد من أوريفون الآن." });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
