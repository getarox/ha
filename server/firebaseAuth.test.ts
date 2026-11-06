import { describe, expect, it } from "vitest";
import { mapFirebaseTokenClaims } from "./firebaseAuth.js";

describe("mapFirebaseTokenClaims", () => {
  it("reuses the existing Google identity for Firebase Google sign-ins", () => {
    expect(mapFirebaseTokenClaims({
      sub: "firebase-user-123",
      email: "User@Example.com",
      email_verified: true,
      name: "Aurevion User",
      firebase: {
        sign_in_provider: "google.com",
        identities: { "google.com": ["google-sub-456"] },
      },
    })).toEqual({
      openId: "google:google-sub-456",
      name: "Aurevion User",
      email: "user@example.com",
      loginMethod: "google",
    });
  });

  it("maps verified password accounts to Firebase email identities", () => {
    expect(mapFirebaseTokenClaims({
      sub: "firebase-user-123",
      email: "user@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    })).toEqual({
      openId: "firebase:firebase-user-123",
      name: "user@example.com",
      email: "user@example.com",
      loginMethod: "email",
    });
  });

  it("rejects unverified emails and unsupported Firebase providers", () => {
    expect(mapFirebaseTokenClaims({
      sub: "firebase-user-123",
      email: "user@example.com",
      email_verified: false,
      firebase: { sign_in_provider: "password" },
    })).toBeNull();
    expect(mapFirebaseTokenClaims({
      sub: "firebase-user-123",
      email: "user@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "phone" },
    })).toBeNull();
  });

  it("keeps long Firebase UIDs within the database openId column limit", () => {
    const identity = mapFirebaseTokenClaims({
      sub: "x".repeat(100),
      email: "user@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    });
    expect(identity?.openId).toHaveLength(64);
    expect(identity?.openId.startsWith("fb:")).toBe(true);
  });
});
