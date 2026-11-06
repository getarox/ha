import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse } from "cookie";
import { COOKIE_NAME } from "../shared/const.js";
import { upsertUser } from "./db.js";
import { sdk } from "./_core/sdk.js";
import { ENV } from "./_core/env.js";

const STATE_COOKIE = "aurevion_google_state";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function serializeCookie(name: string, value: string, options: { httpOnly?: boolean; secure?: boolean; sameSite?: "lax"; path: string; maxAge: number }) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  return parts.join("; ");
}

function redirectUri(req: Request) {
  const forwardedHost = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto ?? req.protocol;
  return ENV.googleRedirectUri || `${protocol}://${host}/api/auth/google/callback`;
}

function secureCookie(req: Request) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/auth/google/start", (req: Request, res: Response) => {
    if (!ENV.googleClientId) return res.status(503).send("Google OAuth غير مهيأ: GOOGLE_CLIENT_ID مفقود.");
    const state = crypto.randomBytes(32).toString("hex");
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    res.setHeader("Set-Cookie", serializeCookie(STATE_COOKIE, state, { httpOnly: true, secure: secureCookie(req), sameSite: "lax", path: "/api/auth/google", maxAge: 600 }));
    return res.redirect(302, url.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const stateCookie = parse(req.headers.cookie ?? "")[STATE_COOKIE] ?? "";
    if (!code || !state || !stateCookie || state.length !== stateCookie.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(stateCookie))) return res.status(400).send("طلب Google غير صالح أو منتهي.");
    if (!ENV.googleClientId || !ENV.googleClientSecret) return res.status(503).send("Google OAuth غير مهيأ في الخادم.");

    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret, redirect_uri: redirectUri(req), grant_type: "authorization_code" }) });
      const token = await tokenResponse.json() as { access_token?: string };
      if (!tokenResponse.ok || !token.access_token) return res.status(401).send("تعذر إكمال تسجيل الدخول عبر Google.");
      const profileResponse = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json() as { sub?: string; name?: string; email?: string };
      if (!profileResponse.ok || !profile.sub || !profile.email) return res.status(401).send("لم تُرجع Google بيانات الحساب المطلوبة.");

      const openId = `google:${profile.sub}`;
      await upsertUser({ openId, name: profile.name ?? null, email: profile.email, loginMethod: "google", lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name: profile.name ?? profile.email });
      res.setHeader("Set-Cookie", [
        serializeCookie(STATE_COOKIE, "", { httpOnly: true, secure: secureCookie(req), sameSite: "lax", path: "/api/auth/google", maxAge: 0 }),
        serializeCookie(COOKIE_NAME, sessionToken, { httpOnly: true, secure: secureCookie(req), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 }),
      ]);
      return res.redirect(302, "/");
    } catch (error) {
      console.error("[Google OAuth] Callback failed", error);
      return res.status(502).send("تعذر الاتصال بخدمة Google حالياً.");
    }
  });
}
