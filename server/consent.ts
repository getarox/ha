import { TRPCError } from "@trpc/server";
import * as db from "./db.js";

export const CONSENT_VERSION = "2026-09-13.v1";
export type ConsentLocale = "ar" | "en";

type ConsentRecord = { version: string; locale: ConsentLocale; acceptedAt: string };
const memoryConsent = new Map<string, ConsentRecord>();

export const agreement = {
  ar: {
    title: "اتفاقية الترخيص والاستخدام الآمن",
    intro: "قبل استخدام AUREVION، اقرأ البنود التالية ووافق عليها. لا تُنفّذ أي أوامر أو طلبات قبل تسجيل موافقتك.",
    bullets: [
      "تستخدم الخدمة للمساعدة المشروعة فقط، وتتحمل مسؤولية المحتوى والطلبات والنتائج التي تنشئها.",
      "لا تستخدمها لإيذاء الأشخاص، أو الاحتيال، أو اختراق الأنظمة، أو انتهاك الخصوصية، أو مخالفة القوانين أو حقوق الغير.",
      "الردود قد تحتوي أخطاء وليست نصيحة قانونية أو طبية أو مالية؛ تحقّق من المعلومات قبل اتخاذ قرار مهم.",
      "قد تُسجّل بيانات الجلسة التقنية اللازمة للتشغيل والحماية وتحسين الخدمة وفق إعدادات الإنتاج وسياسة الخصوصية.",
      "الخدمة مقدمة كما هي دون ضمان نتيجة محددة، ويجوز إيقاف الطلبات المسيئة أو الخطرة أو المخالفة.",
    ],
    accept: "أوافق وأتابع",
    reject: "لا أوافق",
    required: "الموافقة مطلوبة قبل تنفيذ أي أمر.",
  },
  en: {
    title: "License and Safe Use Agreement",
    intro: "Before using AUREVION, read these terms and accept them. No command or request is executed until your consent is recorded.",
    bullets: [
      "Use the service only for lawful and legitimate assistance. You are responsible for your prompts, content, and generated results.",
      "Do not use it to harm people, commit fraud, compromise systems, violate privacy, or infringe laws or third-party rights.",
      "Responses may be wrong and are not legal, medical, or financial advice. Verify important information before acting.",
      "Technical session data may be recorded for operation, security, and service improvement under the production privacy settings.",
      "The service is provided as-is without a guaranteed outcome; abusive, dangerous, or unlawful requests may be blocked.",
    ],
    accept: "I agree and continue",
    reject: "I do not agree",
    required: "Consent is required before any command can run.",
  },
} as const;

function normalizeLocale(value: unknown): ConsentLocale {
  return typeof value === "string" && value.toLowerCase().startsWith("en") ? "en" : "ar";
}

export async function getConsent(sessionId: string) {
  const stored = memoryConsent.get(sessionId);
  if (stored?.version === CONSENT_VERSION) return { accepted: true, ...stored };
  const persisted = await db.getAurevionConsent(sessionId);
  if (persisted?.consentVersion === CONSENT_VERSION && persisted.consentAcceptedAt) {
    const record = { version: persisted.consentVersion, locale: normalizeLocale(persisted.consentLocale), acceptedAt: new Date(persisted.consentAcceptedAt).toISOString() };
    memoryConsent.set(sessionId, record);
    return { accepted: true, ...record };
  }
  return { accepted: false, version: CONSENT_VERSION, locale: normalizeLocale(stored?.locale), acceptedAt: null };
}

export async function acceptConsent(sessionId: string, locale: unknown) {
  const record = { version: CONSENT_VERSION, locale: normalizeLocale(locale), acceptedAt: new Date().toISOString() } as const;
  memoryConsent.set(sessionId, record);
  await db.saveAurevionConsent(sessionId, record);
  return { accepted: true, ...record };
}

export async function requireConsent(sessionId: string) {
  const result = await getConsent(sessionId);
  if (!result.accepted) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "يجب قراءة اتفاقية الترخيص والاستخدام والموافقة عليها قبل تنفيذ أي أمر." });
  }
  return result;
}

export function clearMemoryConsent() { memoryConsent.clear(); }
