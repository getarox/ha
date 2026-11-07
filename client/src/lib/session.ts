export type ConsentLocale = "ar" | "en";

export function getAurevionSessionId(): string {
  if (typeof window === "undefined") return "aurevion-preview-session";

  const storageKey = "aurevion-session-id";
  const current = window.localStorage.getItem(storageKey);
  if (current) return current;

  const next = crypto.randomUUID();
  window.localStorage.setItem(storageKey, next);
  return next;
}

export function getConsentLocale(): ConsentLocale {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en")
    ? "en"
    : "ar";
}
