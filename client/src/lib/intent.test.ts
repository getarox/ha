import { describe, expect, it } from "vitest";
import { isImageGenerationRequest } from "./intent";

describe("image generation intent", () => {
  it.each(["سويلي صورة لمدينة مستقبلية", "اعمل لي رسمة تنين", "ارسملي شعار للمشروع", "أريد تصميم بوستر", "generate a cinematic image", "crée une image"])("routes %s to image studio", (text) => {
    expect(isImageGenerationRequest(text)).toBe(true);
  });
  it.each(["حلل هذه الصورة", "عدّل الصورة وخليها أوضح", "اشرح لي معنى الصورة", "what is in this image?"])("keeps %s in analysis/chat flow", (text) => {
    expect(isImageGenerationRequest(text)).toBe(false);
  });
});
