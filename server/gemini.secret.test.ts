import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.GEMINI_API_KEY)("Gemini server secret", () => {
  it("can access the Gemini models endpoint without exposing the key", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    expect(apiKey).toBeTruthy();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey ?? "")}`,
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  }, 15_000);
});
