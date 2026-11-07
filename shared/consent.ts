export const CONSENT_VERSION = "2026-09-13.v1";
export type ConsentLocale = "ar" | "en";

export const agreement = {
  ar: {
    title: "اتفاقية الترخيص والاستخدام الآمن",
    intro: "بتحديد مربع الموافقة ثم الضغط على تسجيل الدخول أو إنشاء الحساب، توافق على البنود التالية قبل استخدام AUREVION. النص الكامل متاح للقراءة قبل المتابعة.",
    bullets: [
      "تستخدم الخدمة للمساعدة المشروعة فقط، وتتحمل مسؤولية المحتوى والطلبات والنتائج التي تنشئها.",
      "لا تستخدمها لإيذاء الأشخاص، أو الاحتيال، أو اختراق الأنظمة، أو انتهاك الخصوصية، أو مخالفة القوانين أو حقوق الغير.",
      "الردود قد تحتوي أخطاء وليست نصيحة قانونية أو طبية أو مالية؛ تحقّق من المعلومات قبل اتخاذ قرار مهم.",
      "قد تُسجّل بيانات الجلسة التقنية اللازمة للتشغيل والحماية وتحسين الخدمة وفق إعدادات الإنتاج وسياسة الخصوصية.",
      "الخدمة مقدمة كما هي دون ضمان نتيجة محددة، ويجوز إيقاف الطلبات المسيئة أو الخطرة أو المخالفة.",
    ],
    accept: "أوافق وأتابع",
    reject: "لا أوافق",
    required: "تُسجّل موافقتك بعد نجاح تسجيل الدخول، ولا تُنفّذ الأوامر قبل ذلك.",
  },
  en: {
    title: "License and Safe Use Agreement",
    intro: "By checking the consent box and signing in or creating an account, you agree to the following terms before using AUREVION. The full agreement is available to review before continuing.",
    bullets: [
      "Use the service only for lawful and legitimate assistance. You are responsible for your prompts, content, and generated results.",
      "Do not use it to harm people, commit fraud, compromise systems, violate privacy, or infringe laws or third-party rights.",
      "Responses may be wrong and are not legal, medical, or financial advice. Verify important information before acting.",
      "Technical session data may be recorded for operation, security, and service improvement under the production privacy settings.",
      "The service is provided as-is without a guaranteed outcome; abusive, dangerous, or unlawful requests may be blocked.",
    ],
    accept: "I agree and continue",
    reject: "I do not agree",
    required: "Your consent is recorded after sign-in succeeds; commands remain unavailable until then.",
  },
} as const;
