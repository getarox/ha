import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import type { User } from "../drizzle/schema.js";
import { sdk } from "./_core/sdk.js";

const REAL_OAUTH_PROVIDERS = new Set(["google", "email", "phone"]);

export function hasRealOAuthLogin(user: Pick<User, "loginMethod"> | null | undefined) {
  const method = user?.loginMethod?.trim().toLowerCase() ?? "";
  return REAL_OAUTH_PROVIDERS.has(method);
}

export function requireRealOAuthUser(user: User | null | undefined) {
  if (!user || !hasRealOAuthLogin(user)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول عبر Google أو البريد الإلكتروني أو رقم الهاتف قبل تنفيذ أي أمر." });
  }
  return user;
}

export async function authenticateRealOAuthRequest(req: Request) {
  try {
    return requireRealOAuthUser(await sdk.authenticateRequest(req));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول عبر Google أو البريد الإلكتروني أو رقم الهاتف قبل تنفيذ أي أمر." });
  }
}

export function requireFirebaseAccount(user: User | null | undefined): User & { firebaseUid: string } {
  const authenticatedUser = requireRealOAuthUser(user);
  const firebaseUid = authenticatedUser.firebaseUid?.trim();
  if (!firebaseUid) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "جلسة تسجيل الدخول قديمة. سجّل الدخول مجددًا لتأكيد حساب Firebase." });
  }
  return { ...authenticatedUser, firebaseUid };
}

export const realOAuthProviders = ["google", "email", "phone"] as const;
