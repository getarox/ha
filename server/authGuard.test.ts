import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema.js";
import { requireFirebaseAccount } from "./authGuard.js";

function makeUser(firebaseUid: string | null, loginMethod: string | null = "google"): User {
  const now = new Date();
  return {
    id: 1,
    openId: "google:account-123",
    firebaseUid,
    name: "Aurevion User",
    email: "user@example.com",
    loginMethod,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

describe("requireFirebaseAccount", () => {
  it("rejects legacy OAuth sessions that have no Firebase UID", () => {
    expect(() => requireFirebaseAccount(makeUser(null))).toThrow(
      "جلسة تسجيل الدخول قديمة. سجّل الدخول مجددًا لتأكيد حساب Firebase.",
    );
  });

  it("rejects blank Firebase UIDs", () => {
    expect(() => requireFirebaseAccount(makeUser("   "))).toThrow(
      "جلسة تسجيل الدخول قديمة. سجّل الدخول مجددًا لتأكيد حساب Firebase.",
    );
  });

  it("returns only a real OAuth user with a normalized Firebase UID", () => {
    expect(requireFirebaseAccount(makeUser("  firebase-uid-123  ")).firebaseUid).toBe(
      "firebase-uid-123",
    );
  });

  it("continues to reject non-supported login methods", () => {
    expect(() => requireFirebaseAccount(makeUser("firebase-uid-123", "github"))).toThrow(
      "يجب تسجيل الدخول عبر Google أو البريد الإلكتروني أو رقم الهاتف قبل تنفيذ أي أمر.",
    );
  });
});
