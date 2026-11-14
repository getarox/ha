import { describe, expect, it } from "vitest";
import { isValidSessionPayload } from "./_core/sdk.js";

describe("isValidSessionPayload", () => {
  it("accepts signed Firebase sessions when the optional app ID is empty", () => {
    expect(isValidSessionPayload({
      openId: "google:account-123",
      appId: "",
      name: "Aurevion User",
    })).toBe(true);
  });

  it("still requires an appId claim to be a string", () => {
    expect(isValidSessionPayload({
      openId: "google:account-123",
      appId: undefined,
      name: "Aurevion User",
    })).toBe(false);
  });

  it("requires non-empty identity and display name claims", () => {
    expect(isValidSessionPayload({ openId: "", appId: "aurevion", name: "User" })).toBe(false);
    expect(isValidSessionPayload({ openId: "google:account-123", appId: "aurevion", name: "" })).toBe(false);
  });
});
