import { describe, expect, it } from "vitest";
import { isAuthorizedAurevionClient } from "./aurevion";
import { ENV } from "./_core/env";

describe("AUREVION Android client protection", () => {
  it("rejects missing and incorrect keys when protection is configured", () => {
    const previous = ENV.aurevionClientApiKey;
    ENV.aurevionClientApiKey = "configured-client-key";
    expect(isAuthorizedAurevionClient(undefined)).toBe(false);
    expect(isAuthorizedAurevionClient("not-the-configured-key")).toBe(false);
    expect(isAuthorizedAurevionClient("configured-client-key")).toBe(true);
    ENV.aurevionClientApiKey = previous;
  });
});
