import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getUserByOpenId, upsertUser } from "./db.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { sdk } from "./_core/sdk.js";
import { acceptConsent, type ConsentLocale } from "./consent.js";

const FIREBASE_PROJECT_ID = "aurevion-auth-7b9eb";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

type FirebaseIdentity = {
  openId: string;
  name: string;
  email: string;
  loginMethod: "google" | "email";
};

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function openIdForFirebaseUser(uid: string, loginMethod: FirebaseIdentity["loginMethod"], identities: unknown) {
  if (loginMethod === "google" && identities && typeof identities === "object") {
    const googleIds = (identities as Record<string, unknown>)["google.com"];
    const googleId = Array.isArray(googleIds) ? stringClaim(googleIds[0]) : null;
    if (googleId && googleId.length <= 57) return `google:${googleId}`;
  }

  if (uid.length <= 55) return `firebase:${uid}`;
  const digest = createHash("sha256").update(uid).digest("hex").slice(0, 61);
  return `fb:${digest}`;
}

export function mapFirebaseTokenClaims(payload: JWTPayload): FirebaseIdentity | null {
  const uid = stringClaim(payload.sub);
  const email = stringClaim(payload.email)?.toLowerCase() ?? null;
  const verified = payload.email_verified === true;
  const firebase = payload.firebase && typeof payload.firebase === "object"
    ? payload.firebase as Record<string, unknown>
    : {};
  const signInProvider = stringClaim(firebase.sign_in_provider);
  const loginMethod = signInProvider === "google.com"
    ? "google"
    : signInProvider === "password"
      ? "email"
      : null;

  if (!uid || !email || !verified || !loginMethod) return null;

  const name = stringClaim(payload.name) ?? email;
  return {
    openId: openIdForFirebaseUser(uid, loginMethod, firebase.identities),
    name,
    email,
    loginMethod,
  };
}

function sameOriginRequest(req: Request) {
  const originHeader = req.headers.origin;
  if (!originHeader) return true;

  const forwardedHost = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    ?.split(",")[0]
    .trim();
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto ?? req.protocol)
    .split(",")[0]
    .trim();
  if (!host) return false;

  try {
    return new URL(originHeader).origin === `${proto}://${host}`;
  } catch {
    return false;
  }
}

export function registerFirebaseAuthRoutes(app: Express) {
  app.post("/api/auth/firebase/session", async (req, res) => {
    if (!sameOriginRequest(req)) {
      return res.status(403).json({ error: "مصدر طلب تسجيل الدخول غير صالح." });
    }

    const idToken = req.body && typeof req.body.idToken === "string"
      ? req.body.idToken
      : "";
    if (!idToken || idToken.length > 16_384) {
      return res.status(400).json({ error: "رمز Firebase مفقود أو غير صالح." });
    }
    const sessionId = typeof req.body.sessionId === "string" ? req.body.sessionId : "";
    const locale = req.body.locale;
    if (
      sessionId.length < 8 || sessionId.length > 128 ||
      (locale !== "ar" && locale !== "en") || req.body.acceptedTerms !== true
    ) {
      return res.status(400).json({ error: "حدد مربع الموافقة على الاتفاقية قبل تسجيل الدخول." });
    }

    let payload: JWTPayload;
    try {
      const verifiedToken = await jwtVerify(idToken, FIREBASE_JWKS, {
        algorithms: ["RS256"],
        audience: FIREBASE_PROJECT_ID,
        issuer: FIREBASE_ISSUER,
        clockTolerance: 5,
      });
      payload = verifiedToken.payload;
    } catch {
      return res.status(401).json({ error: "تعذر التحقق من حساب Firebase. سجّل الدخول مجددًا." });
    }

    const identity = mapFirebaseTokenClaims(payload);
    if (!identity) {
      return res.status(403).json({ error: "يجب استخدام Google أو بريد إلكتروني موثّق لتسجيل الدخول." });
    }

    try {
      await upsertUser({
        openId: identity.openId,
        name: identity.name,
        email: identity.email,
        loginMethod: identity.loginMethod,
        lastSignedIn: new Date(),
      });
      const storedUser = await getUserByOpenId(identity.openId);
      if (!storedUser) {
        return res.status(503).json({ error: "خدمة الحسابات غير متاحة حاليًا. حاول لاحقًا." });
      }

      try {
        await acceptConsent(sessionId, locale as ConsentLocale);
      } catch (error) {
        console.error("[Firebase Auth] Consent persistence failed", error);
        return res.status(503).json({ error: "تعذر حفظ موافقتك على الاتفاقية في الوقت الحالي. حاول مجددًا." });
      }

      const sessionToken = await sdk.createSessionToken(identity.openId, {
        name: identity.name,
        appId: FIREBASE_PROJECT_ID,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error("[Firebase Auth] Session creation failed", error);
      return res.status(503).json({ error: "تعذر إنشاء جلسة آمنة حاليًا. حاول لاحقًا." });
    }
  });
}
