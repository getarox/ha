import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function response() {
  const result: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
    setHeader(name: string, value: string) { result.headers[name] = value; },
    end() { return this; },
  } as unknown as VercelResponse;
  return { res, result };
}

describe("AUREVION REST handlers", () => {
  it("returns a clear JSON error for invalid wallet sessions", async () => {
    vi.resetModules();
    const { wallet } = await import("./httpHandlers");
    const { res, result } = response();
    await wallet({ method: "GET", query: { sessionId: "bad" } } as unknown as VercelRequest, res);
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ error: "sessionId غير صالح." });
  });

  it("rejects invalid chat payloads before invoking providers", async () => {
    vi.resetModules();
    const { chat } = await import("./httpHandlers");
    const { res, result } = response();
    await chat({ method: "POST", headers: {}, body: { sessionId: "short", messages: [] } } as unknown as VercelRequest, res);
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ error: "بيانات المحادثة غير صالحة." });
  });
});
