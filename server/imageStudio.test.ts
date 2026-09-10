import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("AUREVION image studio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env.DATABASE_URL = "";
    process.env.GROQ_API_KEY = "test-groq-key";
    vi.unmock("./db");
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.AUREVION_FREE_IMAGE_LIMIT = "3";
  });

  it("analyzes an image through Groq Vision and returns quota metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ choices: [{ message: { content: "الصورة واضحة ومتوازنة." } }] })));
    const { runImageStudio } = await import("./imageStudio");
    const result = await runImageStudio({ sessionId: `vision-${Date.now()}-a`, mode: "analyze", prompt: "حلل هذه الصورة", imageBase64: "data:image/png;base64,AAAA" });
    expect(result.kind).toBe("text");
    expect(result.text).toContain("واضحة");
    expect(result.remaining).toBe(2);
    expect(result.model).toBe("qwen/qwen3.6-27b");
  });

  it("selects distinct provider models for Free and Pro image workflows", async () => {
    const { getImageStudioModel } = await import("./imageStudio");
    expect(getImageStudioModel("analyze", false)).toBe("qwen/qwen3.6-27b");
    expect(getImageStudioModel("analyze", true)).toBe("qwen/qwen3.8-27b");
    expect(getImageStudioModel("generate", false)).toBe("gemini-3.1-flash-image");
    expect(getImageStudioModel("generate", true)).toBe("gemini-3-pro-image");
  });

  it("clarifies Arabic cat prompts and excludes people", async () => {
    const { runImageStudio } = await import("./imageStudio");
    const result = await runImageStudio({ sessionId: `cat-${Date.now()}`, mode: "generate", prompt: "صورة لقطة تنام في حديقة بيت تراثي عراقي" });
    const generatedUrl = decodeURIComponent(String(result.imageDataUrl));
    expect(generatedUrl).toContain("قطة حقيقية نائمة");
    expect(generatedUrl).toContain("بدون أي أشخاص");
  });

  it("runs Groq Pro for a persisted Pro session without exposing the API key", async () => {
    process.env.DATABASE_URL = "mysql://test";
    const getAurevionSession = vi.fn(async () => ({ id: 7, sessionId: "persisted-pro-a", plan: "pro" as const, imagesUsed: 0 }));
    const updateAurevionSession = vi.fn(async () => undefined);
    vi.doMock("./db", () => ({ getAurevionSession, createAurevionSession: vi.fn(), updateAurevionSession }));
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({ choices: [{ message: { content: "تحليل Pro جاهز." } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio");
    const result = await runImageStudio({ sessionId: "persisted-pro-a", mode: "evaluate", prompt: "قيّم التكوين", imageBase64: "data:image/png;base64,AAAA", pro: true });
    expect(result.plan).toBe("pro");
    expect(result.model).toBe("qwen/qwen3.8-27b");
    expect(result.remaining).toBe(99);
    expect(requestBody?.model).toBe("qwen/qwen3.8-27b");
    expect(JSON.stringify(requestBody)).not.toContain("test-groq-key");
    expect(updateAurevionSession).toHaveBeenCalledWith(7, { imagesUsed: 1 });
  });

  it("runs Banana Pro for a persisted Pro session and returns an image", async () => {
    process.env.DATABASE_URL = "mysql://test";
    const getAurevionSession = vi.fn(async () => ({ id: 8, sessionId: "persisted-pro-b", plan: "pro" as const, imagesUsed: 0 }));
    const updateAurevionSession = vi.fn(async () => undefined);
    vi.doMock("./db", () => ({ getAurevionSession, createAurevionSession: vi.fn(), updateAurevionSession }));
    let requestUrl = "";
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      requestUrl = url;
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "تم إنشاء الصورة." }, { inlineData: { mimeType: "image/png", data: "AQID" } }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio");
    const result = await runImageStudio({ sessionId: "persisted-pro-b", mode: "generate", prompt: "رأس أوريفون بإضاءة نيون", pro: true });
    expect(result.kind).toBe("image");
    expect(result.plan).toBe("pro");
    expect(result.model).toBe("gemini-3-pro-image");
    expect(result.imageDataUrl).toBe("data:image/png;base64,AQID");
    expect(requestUrl).toContain("models/gemini-3-pro-image:generateContent");
    expect(requestBody?.generationConfig).toEqual({ responseModalities: ["TEXT", "IMAGE"] });
    expect(JSON.stringify(result)).not.toContain("test-gemini-key");
    expect(updateAurevionSession).toHaveBeenCalledWith(8, { imagesUsed: 1 });
  });

  it("hides the Gemini secret when the provider returns an error", async () => {
    process.env.DATABASE_URL = "mysql://test";
    const getAurevionSession = vi.fn(async () => ({ id: 9, sessionId: "persisted-pro-c", plan: "pro" as const, imagesUsed: 0 }));
    vi.doMock("./db", () => ({ getAurevionSession, createAurevionSession: vi.fn(), updateAurevionSession: vi.fn() }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "upstream failure test-gemini-key" }, 500)));
    const { runImageStudio } = await import("./imageStudio");
    const error = await runImageStudio({ sessionId: "persisted-pro-c", mode: "generate", prompt: "اختبار خطأ", pro: true }).catch((value: unknown) => value as Error);
    expect(error.message).not.toContain("test-gemini-key");
  });

  it("returns TOO_MANY_REQUESTS after the free image quota is exhausted", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ text: "تم." }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio");
    const sessionId = `quota-free-${Date.now()}`;
    for (let index = 0; index < 3; index += 1) await runImageStudio({ sessionId, mode: "generate", prompt: "صورة اختبار" });
    await expect(runImageStudio({ sessionId, mode: "generate", prompt: "صورة رابعة" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("returns TOO_MANY_REQUESTS after the Pro image quota is exhausted", async () => {
    process.env.DATABASE_URL = "mysql://test";
    process.env.AUREVION_PRO_IMAGE_LIMIT = "2";
    let imagesUsed = 0;
    const getAurevionSession = vi.fn(async () => ({ id: 10, sessionId: "persisted-pro-quota", plan: "pro" as const, imagesUsed }));
    const updateAurevionSession = vi.fn(async (_id: number, update: { imagesUsed: number }) => { imagesUsed = update.imagesUsed; });
    vi.doMock("./db", () => ({ getAurevionSession, createAurevionSession: vi.fn(), updateAurevionSession }));
    const fetchMock = vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ text: "تم." }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio");
    const input = { sessionId: "persisted-pro-quota", mode: "generate" as const, prompt: "صورة Pro", pro: true };
    await runImageStudio(input);
    await runImageStudio(input);
    await expect(runImageStudio(input)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects Groq Pro Vision for a free session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio");
    await expect(runImageStudio({ sessionId: `free-vision-${Date.now()}`, mode: "evaluate", prompt: "قيّم الصورة", imageBase64: "data:image/png;base64,AAAA", pro: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not allow Banana Pro for a free session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio");
    await expect(runImageStudio({ sessionId: `pro-${Date.now()}-a`, mode: "generate", prompt: "صمم رأس أوريفون", pro: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
