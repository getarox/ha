import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const input = (overrides: Record<string, unknown> = {}) => ({
  sessionId: `image-${crypto.randomUUID()}`,
  firebaseUid: "verified-firebase-uid",
  mode: "generate" as const,
  prompt: "صورة اختبار واضحة",
  ...overrides,
});

describe("AUREVION Workers AI image generation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock("./billing.js");
    vi.unmock("./db.js");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("AUREVION_IMAGE_WORKER_URL", "https://worker.example.test/image");
    vi.stubEnv("AUREVION_IMAGE_WORKER_SECRET", "test-worker-secret");
  });

  it("uses Cloudflare Worker as the primary provider and sends the secret server-side", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ image: "AQIDBA==" }));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    const result = await runImageStudio(input());
    expect(result.provider).toBe("cloudflare");
    expect(result.imageDataUrl).toBe("data:image/png;base64,AQIDBA==");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://worker.example.test/image");
    expect(new Headers(request.headers).get("X-AUREVION-WORKER-SECRET")).toBe("test-worker-secret");
    expect(JSON.parse(String(request.body))).toMatchObject({ model: "@cf/black-forest-labs/flux-2-klein-4b", width: 512, height: 512 });
  });

  it("uses Gemini only after a technical Worker failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: "WORKER_INFERENCE_FAILED" }, 502))
      .mockResolvedValueOnce(jsonResponse({ candidates: [{ content: { parts: [{ text: "صورة احتياطية" }, { inlineData: { mimeType: "image/png", data: "AQID" } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    const result = await runImageStudio(input());
    expect(result.provider).toBe("gemini");
    expect(result.imageDataUrl).toBe("data:image/png;base64,AQID");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
  });

  it("sends reference edits through Cloudflare Worker and accounts for the input tile", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ image: "AQIDBA==" }));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    const result = await runImageStudio(input({ mode: "edit", imageBase64: "data:image/jpeg;base64,AQID", mimeType: "image/jpeg" }));
    expect(result.provider).toBe("cloudflare");
    expect(result.neuronCost).toBe(31.42);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ inputImageBase64: "data:image/jpeg;base64,AQID", inputImageMimeType: "image/jpeg" });
  });

  it("does not call Gemini when Cloudflare explicitly reports daily Neuron exhaustion", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: "CLOUDFLARE_DAILY_QUOTA" }, 429));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    await expect(runImageStudio(input())).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not start any provider when the signed-in user's free quota and Neuron balance are exhausted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("./billing.js", () => ({
      neuronBalance: vi.fn(async () => 0),
      freeImagesRemaining: vi.fn(async () => 0),
      reserveNeuronBalance: vi.fn(),
      refundNeuronReservation: vi.fn(),
      reserveCloudflareUsage: vi.fn(),
      releaseCloudflareUsage: vi.fn(),
      reserveFreeImage: vi.fn(),
      releaseFreeImage: vi.fn(),
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    await expect(runImageStudio(input())).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not allow client session IDs to replace the verified Firebase UID", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    await expect(runImageStudio(input({ firebaseUid: undefined }))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Gemini or the Worker after the account-wide daily cap is reached", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("./billing.js", () => ({
      neuronBalance: vi.fn(async () => 0),
      freeImagesRemaining: vi.fn(async () => 3),
      reserveFreeImage: vi.fn(async () => "2026-11-14"),
      releaseFreeImage: vi.fn(),
      reserveCloudflareUsage: vi.fn(async () => { throw new Error("CLOUDFLARE_DAILY_CAP"); }),
      releaseCloudflareUsage: vi.fn(),
      reserveNeuronBalance: vi.fn(),
      refundNeuronReservation: vi.fn(),
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    await expect(runImageStudio(input())).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps image analysis on its existing Groq Vision route", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "الصورة واضحة." } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { runImageStudio } = await import("./imageStudio.js");
    const result = await runImageStudio(input({ mode: "analyze", imageBase64: "data:image/png;base64,AQID" }));
    expect(result.provider).toBe("groq");
    expect(result.text).toContain("واضحة");
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.groq.com");
  });
});
