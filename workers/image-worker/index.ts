interface Env {
  AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  AUREVION_WORKER_SECRET: string;
}

type WorkerInput = {
  model?: string;
  prompt?: string;
  width?: number;
  height?: number;
  inputImageBase64?: string;
  inputImageMimeType?: string;
};

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function decodeImage(value: string, mimeType: string) {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (base64.length > 6_000_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("INVALID_IMAGE_DATA");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
    if (!env.AUREVION_WORKER_SECRET || request.headers.get("X-AUREVION-WORKER-SECRET") !== env.AUREVION_WORKER_SECRET) {
      return json({ code: "UNAUTHORIZED" }, 401);
    }

    let body: WorkerInput;
    try { body = await request.json() as WorkerInput; }
    catch { return json({ code: "INVALID_JSON" }, 400); }

    if (body.model !== "@cf/black-forest-labs/flux-2-klein-4b" || typeof body.prompt !== "string" || body.prompt.trim().length < 2 || body.prompt.length > 4000 || ![512, 1024].includes(body.width ?? 0) || body.width !== body.height) {
      return json({ code: "INVALID_REQUEST" }, 400);
    }

    const form = new FormData();
    form.set("prompt", body.prompt);
    form.set("width", String(body.width));
    form.set("height", String(body.height));
    if (body.inputImageBase64) {
      const mimeType = ["image/png", "image/jpeg", "image/webp"].includes(body.inputImageMimeType ?? "") ? body.inputImageMimeType! : "image/png";
      try { form.set("input_image_0", decodeImage(body.inputImageBase64, mimeType), `reference.${mimeType.split("/")[1]}`); }
      catch { return json({ code: "INVALID_IMAGE_DATA" }, 400); }
    }

    // FLUX.2 Klein 4B uses multipart form data even for text-only prompts.
    const serializedForm = new Response(form);
    const contentType = serializedForm.headers.get("content-type");
    if (!contentType || !serializedForm.body) return json({ code: "MULTIPART_ENCODING_FAILED" }, 500);

    try {
      const output = await env.AI.run(body.model, { multipart: { body: serializedForm.body, contentType } }) as { image?: unknown };
      if (typeof output?.image !== "string" || !/^[A-Za-z0-9+/=]+$/.test(output.image)) return json({ code: "INVALID_PROVIDER_RESPONSE" }, 502);
      return json({ image: output.image });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/daily.{0,60}(neuron|quota|allocation|limit|exhaust|exceed)|(neuron|quota).{0,60}(daily|exhaust|exceed|limit)|exceed.{0,60}neuron/i.test(message)) {
        return json({ code: "CLOUDFLARE_DAILY_QUOTA" }, 429);
      }
      console.error("Workers AI inference failed", message.slice(0, 300));
      return json({ code: "WORKER_INFERENCE_FAILED" }, 502);
    }
  },
};
