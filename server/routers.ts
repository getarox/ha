import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { z } from "zod";
import { chatWithAurevion, getAurevionHealth, getAurevionSessionStats, isAllowedAurevionOrigin, setAurevionPlan } from "./aurevion";
import { runImageStudio } from "./imageStudio";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  aurevion: router({
    chat: publicProcedure
      .input(z.object({
        sessionId: z.string().min(8).max(128),
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(8000),
        })).min(1).max(12),
        webSearch: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const origin = ctx.req.headers.origin;
        if (typeof origin === "string" && !isAllowedAurevionOrigin(origin)) {
          throw new Error("هذا النطاق غير مصرح له باستخدام بوابة أوريفون.");
        }
        return chatWithAurevion(input);
      }),
    imageStudio: publicProcedure
      .input(z.object({
        sessionId: z.string().min(8).max(128),
        mode: z.enum(["generate", "edit", "analyze", "evaluate"]),
        prompt: z.string().min(2).max(4000),
        imageBase64: z.string().max(28_000_000).optional(),
        mimeType: z.string().max(64).optional(),
        pro: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const origin = ctx.req.headers.origin;
        if (typeof origin === "string" && !isAllowedAurevionOrigin(origin)) {
          throw new Error("هذا النطاق غير مصرح له باستخدام استوديو أوريفون.");
        }
        return runImageStudio(input);
      }),
    ownerHealth: adminProcedure.query(async () => getAurevionHealth()),
    ownerSetPlan: adminProcedure
      .input(z.object({ sessionId: z.string().min(8).max(128), plan: z.enum(["free", "pro"]) }))
      .mutation(({ input }) => setAurevionPlan(input.sessionId, input.plan)),
    ownerStats: adminProcedure.query(async () => {
      const stats = await getAurevionSessionStats();
      return {
        identity: "أوريفون — عقل روبوتي مفتوح المصدر مبني على Groq لهاتف AUREVION",
        developer: "حارث عبدالله الجبوري",
        officialSiteUrl: ENV.officialSiteUrl,
        model: ENV.groqModel,
        plans: [
          { id: "free", name: "مجانية", messages: ENV.freeMessageLimit },
          { id: "pro", name: "احترافية", messages: ENV.proMessageLimit },
        ],
        stats,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
