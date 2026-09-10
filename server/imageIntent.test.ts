import { describe, expect, it } from "vitest";
import { resolveServerImageIntent } from "./imageIntent";

describe("server image intent", () => {
  it.each(["سويلي صورة لمدينة مستقبلية", "اعمل لي رسمة تنين", "generate a cinematic image", "صمم شعار للمشروع"])("detects generation: %s", (prompt) => {
    expect(resolveServerImageIntent(prompt)).toBe("generate");
  });
  it("detects edit and analysis only with an image", () => {
    expect(resolveServerImageIntent("عدّل الصورة وخليها أوضح")).toBeNull();
    expect(resolveServerImageIntent("عدّل الصورة وخليها أوضح", true)).toBe("edit");
    expect(resolveServerImageIntent("حلل هذه الصورة", true)).toBe("analyze");
  });
  it("does not turn ordinary questions into image requests", () => {
    expect(resolveServerImageIntent("ما هو أفضل تصميم لموقع؟")).toBeNull();
    expect(resolveServerImageIntent("ابحث عن صورة قطة")).toBeNull();
  });
});
