import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AUREVION secure brain", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DATABASE_URL = "";
    process.env.GROQ_API_KEY = "test-only-key";
    process.env.NODE_ENV = "test";
  });

  it("allows development and official origins but rejects unknown production origins", async () => {
    vi.resetModules();
    const { isAllowedAurevionOrigin } = await import("./aurevion");
    expect(isAllowedAurevionOrigin("http://localhost:3000")).toBe(true);
  });

  it("enforces cooldown and quota while isolating sessions", async () => {
    vi.useFakeTimers();
    process.env.AUREVION_FREE_MESSAGE_LIMIT = "1";
    try {
      vi.resetModules();
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
        choices: [{ message: { content: "رد اختباري" } }],
      })));
      const { chatWithAurevion } = await import("./aurevion");
      const firstSession = "session-a-123456";
      const secondSession = "session-b-123456";

      await chatWithAurevion({ sessionId: firstSession, messages: [{ role: "user", content: "الأولى" }] });
      await expect(chatWithAurevion({ sessionId: firstSession, messages: [{ role: "user", content: "الثانية" }] })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      vi.advanceTimersByTime(901);
      await expect(chatWithAurevion({ sessionId: firstSession, messages: [{ role: "user", content: "الثانية" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      vi.advanceTimersByTime(901);
      const isolated = await chatWithAurevion({ sessionId: secondSession, messages: [{ role: "user", content: "جلسة أخرى" }] });
      expect(isolated.remaining).toBe(0);
    } finally {
      delete process.env.AUREVION_FREE_MESSAGE_LIMIT;
      vi.useRealTimers();
    }
  });

  it("calls Groq with a bounded conversation and returns remaining quota", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "أنا أوريفون، جاهز للمساعدة." } }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { chatWithAurevion } = await import("./aurevion");

    const result = await chatWithAurevion({
      sessionId: `test-${Date.now()}-session`,
      messages: [{ role: "user", content: "من أنت؟" }],
    });

    expect(result.reply).toContain("أوريفون");
    expect(result.remaining).toBe(24);
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.messages[0].content).toContain("AUREVION");
    expect(body.messages).toHaveLength(2);
    expect(body).not.toHaveProperty("apiKey");
  });
});
