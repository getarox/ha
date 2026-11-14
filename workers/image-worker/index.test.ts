import { describe, expect, it, vi } from "vitest";
import worker from "./index.js";

const secret = "worker-test-secret";
function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://worker.test/image", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AUREVION-WORKER-SECRET": secret, ...headers },
    body: JSON.stringify(body),
  });
}
const env = (run: ReturnType<typeof vi.fn>) => ({ AUREVION_WORKER_SECRET: secret, AI: { run } });

describe("Cloudflare image Worker", () => {
  it("sends even text-only image generation to the binding as multipart form data", async () => {
    const run = vi.fn(async () => ({ image: "AQIDBA==" }));
    const response = await worker.fetch(request({ model: "@cf/black-forest-labs/flux-2-klein-4b", prompt: "صورة اختبار", width: 512, height: 512 }), env(run));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: "AQIDBA==" });
    expect(run).toHaveBeenCalledOnce();
    const [, input] = run.mock.calls[0] as unknown as [string, { multipart: { body: ReadableStream; contentType: string } }];
    expect(input.multipart.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const serialized = await new Response(input.multipart.body, { headers: { "Content-Type": input.multipart.contentType } }).text();
    expect(serialized).toContain('name="prompt"');
    expect(serialized).toContain("صورة اختبار");
    expect(serialized).toContain('name="width"');
    expect(serialized).toContain("512");
  });

  it("serializes a reference image as input_image_0", async () => {
    const run = vi.fn(async () => ({ image: "AQIDBA==" }));
    const response = await worker.fetch(request({ model: "@cf/black-forest-labs/flux-2-klein-4b", prompt: "غيّر الخلفية", width: 512, height: 512, inputImageBase64: "data:image/jpeg;base64,AQID", inputImageMimeType: "image/jpeg" }), env(run));
    expect(response.status).toBe(200);
    const [, input] = run.mock.calls[0] as unknown as [string, { multipart: { body: ReadableStream; contentType: string } }];
    const serialized = await new Response(input.multipart.body, { headers: { "Content-Type": input.multipart.contentType } }).text();
    expect(serialized).toContain('name="input_image_0"');
    expect(serialized).toContain("filename=\"reference.jpeg\"");
    expect(serialized).toContain("Content-Type: image/jpeg");
  });

  it("rejects callers without the shared secret before invoking Workers AI", async () => {
    const run = vi.fn();
    const response = await worker.fetch(request({ model: "@cf/black-forest-labs/flux-2-klein-4b", prompt: "صورة", width: 512, height: 512 }, { "X-AUREVION-WORKER-SECRET": "wrong" }), env(run));
    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns an explicit non-fallback quota code for daily Neuron exhaustion", async () => {
    const run = vi.fn(async () => { throw new Error("Workers AI daily limit exceeded"); });
    const response = await worker.fetch(request({ model: "@cf/black-forest-labs/flux-2-klein-4b", prompt: "صورة", width: 512, height: 512 }), env(run));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: "CLOUDFLARE_DAILY_QUOTA" });
  });
});
