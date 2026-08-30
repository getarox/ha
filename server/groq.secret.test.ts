import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.GROQ_API_KEY)("Groq server secret", () => {
  it("authenticates against the Groq models endpoint without exposing the key", async () => {
    const apiKey = process.env.GROQ_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured in the test environment");
    }

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.status).toBe(200);
  }, 15_000);
});
