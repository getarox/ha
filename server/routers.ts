import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { z } from "zod";
import { chatWithAurevion, getAurevionHealth, getAurevionSessionStats, isAllowedAurevionOrigin, setAurevionPlan } from "./aurevion.js";
import { runImageStudio } from "./imageStudio.js";
import { adminProcedure, publicProcedure, router } from "./_core/trpc.js";
import { ENV } from "./_core/env.js";
import { agreement, acceptConsent, getConsent, requireConsent } from "./consent.js";
import { requireFirebaseAccount, requireRealOAuthUser } from "./authGuard.js";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  aurevion: router({
    consent: router({
      agreement: publicProcedure.query(() => ({ version: "2026-09-13.v1", agreement })),
      status: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(128) })).query(({ input }) => getConsent(input.sessionId)),
      accept: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(128), locale: z.enum(["ar", "en"]).default("ar") })).mutation(({ input }) => acceptConsent(input.sessionId, input.locale)),
    }),
    chat: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(128), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(12), webSearch: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      requireRealOAuthUser(ctx.user);
      await requireConsent(input.sessionId);
      const origin = ctx.req.headers.origin;
      if (typeof origin === "string" && !isAllowedAurevionOrigin(origin)) throw new Error("هذا النطاق غير مصرح له باستخدام بوابة أوريفون.");
      return chatWithAurevion(input);
    }),
    imageStudio: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(128), mode: z.enum(["generate", "edit", "analyze", "evaluate"]), prompt: z.string().min(2).max(4000), imageBase64: z.string().max(28_000_000).optional(), mimeType: z.string().max(64).optional(), pro: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      const firebaseUser = requireFirebaseAccount(ctx.user);
      await requireConsent(input.sessionId);
      const origin = ctx.req.headers.origin;
      if (typeof origin === "string" && !isAllowedAurevionOrigin(origin)) throw new Error("هذا النطاق غير مصرح له باستخدام استوديو أوريفون.");
      return runImageStudio({ ...input, firebaseUid: firebaseUser.firebaseUid });
    }),
    ownerHealth: adminProcedure.query(async () => getAurevionHealth()),
    ownerSetPlan: adminProcedure.input(z.object({ sessionId: z.string().min(8).max(128), plan: z.enum(["free", "pro"]) })).mutation(({ input }) => setAurevionPlan(input.sessionId, input.plan)),
    ownerStats: adminProcedure.query(async () => ({ identity: "أوريفون — عقل روبوتي مفتوح المصدر مبني على Groq لهاتف AUREVION", officialSiteUrl: ENV.officialSiteUrl, model: ENV.groqModel, plans: [{ id: "free", name: "مجانية", messages: ENV.freeMessageLimit }, { id: "pro", name: "احترافية", messages: ENV.proMessageLimit }], stats: await getAurevionSessionStats() })),
  }),
});

export type AppRouter = typeof appRouter;
