import { TRPCError } from "@trpc/server";
import * as db from "./db.js";
import { agreement, CONSENT_VERSION, type ConsentLocale } from "../shared/consent.js";

export { agreement, CONSENT_VERSION };
export type { ConsentLocale };

type ConsentRecord = { version: string; locale: ConsentLocale; acceptedAt: string };
const memoryConsent = new Map<string, ConsentRecord>();

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
  await db.saveAurevionConsent(sessionId, record);
  memoryConsent.set(sessionId, record);
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
