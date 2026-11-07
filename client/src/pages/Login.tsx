import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { firebaseAuth, googleProvider } from "@/lib/firebase";
import { getAurevionSessionId, getConsentLocale } from "@/lib/session";
import { agreement as agreementText } from "@shared/consent";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

type AuthMode = "signin" | "signup";

function safeReturnPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return "/";
  try {
    const destination = new URL(next, window.location.origin);
    return destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/";
  } catch {
    return "/";
  }
}

function firebaseErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  const messages: Record<string, string> = {
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/email-already-in-use": "هذا البريد مسجل مسبقًا. سجّل الدخول بدلًا من إنشاء حساب جديد.",
    "auth/weak-password": "اختر كلمة مرور أقوى، من 8 أحرف على الأقل.",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    "auth/popup-closed-by-user": "أُغلقت نافذة Google قبل اكتمال تسجيل الدخول.",
    "auth/popup-blocked": "حظر المتصفح النافذة المنبثقة. اسمح بها ثم أعد المحاولة.",
    "auth/operation-not-allowed": "طريقة تسجيل الدخول هذه غير مفعّلة في إعدادات Firebase.",
    "auth/network-request-failed": "تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.",
  };
  return messages[code] ?? "تعذر تسجيل الدخول الآن. تحقق من إعداد Firebase وحاول مجددًا.";
}

async function createServerSession(user: User, sessionId: string, locale: "ar" | "en") {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/firebase/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, sessionId, locale, acceptedTerms: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "تعذر إنشاء جلسة أوريفون.");
  }
  window.location.replace(safeReturnPath());
}

export default function Login() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionId] = useState(getAurevionSessionId);
  const [locale] = useState(getConsentLocale);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const agreement = agreementText[locale];

  useEffect(() => {
    document.title = "تسجيل الدخول | AUREVION";
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (caught) {
      const hasFirebaseCode = typeof caught === "object" && caught !== null && "code" in caught;
      setError(caught instanceof Error && !hasFirebaseCode ? caught.message : firebaseErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = () => run(async () => {
    const credential = await signInWithPopup(firebaseAuth, googleProvider);
    await createServerSession(credential.user, sessionId, locale);
  });

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acceptedTerms) {
      setError("حدد مربع الموافقة على الاتفاقية قبل المتابعة.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    return run(async () => {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password);
        await sendEmailVerification(credential.user);
        await signOut(firebaseAuth);
        setMode("signin");
        setPassword("");
        setNotice("أنشأنا الحساب وأرسلنا رسالة تحقق إلى بريدك. أكّد البريد ثم سجّل الدخول.");
        return;
      }

      const credential = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password);
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await signOut(firebaseAuth);
        setError("تحقق من بريدك الإلكتروني أولًا. أرسلنا إليك رسالة تحقق جديدة.");
        return;
      }
      await createServerSession(credential.user, sessionId, locale);
    });
  };

  const resetPassword = () => run(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setBusy(false);
      setError("اكتب بريدك الإلكتروني أولًا لإرسال رابط إعادة التعيين.");
      return;
    }
    await sendPasswordResetEmail(firebaseAuth, normalizedEmail);
    setNotice("إذا كان البريد مسجلًا، فستصلك رسالة لإعادة تعيين كلمة المرور.");
  });

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#050b14] px-4 py-8 text-slate-100 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-cyan-400/[0.07] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -left-40 size-[34rem] rounded-full bg-blue-600/[0.08] blur-3xl" />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link href="/" className="group flex items-center gap-3" aria-label="العودة إلى أوريفون">
          <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]"><span className="text-lg font-bold">A</span></span>
          <span>
            <span className="block text-sm font-semibold tracking-[0.2em] text-white">AUREVION</span>
            <span className="block text-[9px] tracking-[0.25em] text-cyan-200/50">OPEN ROBOTIC INTELLIGENCE</span>
          </span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-200/30 hover:text-white">
          <ArrowLeft className="size-4" /> العودة للموقع
        </Link>
      </header>

      <section className="relative mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-6xl items-center gap-10 py-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
        <div className="hidden lg:block">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-xs tracking-wide text-cyan-100/80">
            <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
            بوابة أوريفون الرسمية
          </div>
          <p className="text-xs tracking-[0.25em] text-cyan-200/50">SECURE ACCESS / FIREBASE AUTH</p>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-[1.12] tracking-tight text-white">عُد إلى <span className="text-cyan-200">عقلك</span> الرقمي.</h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-slate-400">سجّل دخولك بأمان لمتابعة محادثاتك واستخدام خدمات أوريفون. تُدار المصادقة عبر Firebase، وتبقى بيانات مزودي الذكاء الاصطناعي على الخادم.</p>
          <div className="mt-9 flex items-center gap-3 text-sm text-slate-400"><ShieldCheck className="size-5 text-cyan-200" /> اتصال مشفّر وجلسة آمنة للموقع</div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-cyan-200/15 bg-slate-950/75 p-6 shadow-[0_25px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
            <div className="mb-7">
              <p className="text-xs tracking-[0.2em] text-cyan-200/60">AUREVION / ACCOUNT</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{mode === "signin" ? "اختر طريقة الدخول المناسبة لك." : "أنشئ حسابًا جديدًا للبدء مع أوريفون."}</p>
            </div>

            <div className="mb-4 rounded-xl border border-cyan-200/15 bg-cyan-300/[0.04] p-3 text-xs leading-6 text-slate-300">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  className="mt-1 size-5 border-slate-500 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor="accept-terms" className="cursor-pointer font-medium text-cyan-100">
                    {locale === "en" ? "I agree to " : "أوافق على "}{agreement.title}
                  </label>
                  <p className="mt-1 text-slate-400">
                    {locale === "en" ? "Check the box, then choose a sign-in option. Consent is saved after sign-in succeeds." : "ضع علامة في المربع، ثم اختر طريقة الدخول. تُحفظ الموافقة بعد نجاح تسجيل الدخول."}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none font-medium text-cyan-200 hover:text-white">
                      {locale === "en" ? "Read the full agreement" : "قراءة الاتفاقية كاملة"}
                    </summary>
                    <div className="mt-3 max-h-52 space-y-3 overflow-y-auto pe-1 text-slate-300">
                      <p>{agreement.intro}</p>
                      <ul className="list-disc space-y-2 ps-5">
                        {agreement.bullets.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}
                      </ul>
                      <p className="text-amber-100">{agreement.required}</p>
                    </div>
                  </details>
                </div>
              </div>
            </div>

            <Button type="button" onClick={() => void signInWithGoogle()} disabled={busy || !acceptedTerms} className="h-12 w-full border border-white/15 bg-white text-slate-900 hover:bg-slate-100">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleMark />}
              المتابعة باستخدام Google
            </Button>

            <div className="my-6 flex items-center gap-3 text-[11px] text-slate-500"><span className="h-px flex-1 bg-white/10" /><span>أو باستخدام البريد الإلكتروني</span><span className="h-px flex-1 bg-white/10" /></div>

            <form onSubmit={submitEmail} className="space-y-4">
              <label className="block space-y-2 text-sm text-slate-300">
                <span>البريد الإلكتروني</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="h-11 border-white/10 bg-white/[0.04] pe-10 text-left text-white placeholder:text-slate-600" dir="ltr" />
                </span>
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>كلمة المرور</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <Input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={mode === "signin" ? 6 : 8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "8 أحرف على الأقل" : "••••••••"} className="h-11 border-white/10 bg-white/[0.04] pe-10 text-white placeholder:text-slate-600" />
                </span>
              </label>

              {mode === "signin" && <div className="text-left"><button type="button" onClick={() => void resetPassword()} disabled={busy} className="text-xs text-cyan-200/80 transition hover:text-cyan-100 disabled:opacity-50">نسيت كلمة المرور؟</button></div>}

              <Button type="submit" disabled={busy || !acceptedTerms} className="h-11 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {mode === "signin" ? "دخول إلى أوريفون" : "إنشاء الحساب"}
              </Button>
            </form>

            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm leading-6 text-rose-100">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-sm leading-6 text-emerald-100">{notice}</p>}

            <p className="mt-6 text-center text-sm text-slate-400">
              {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
              <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }} className="font-medium text-cyan-200 hover:text-white">
                {mode === "signin" ? "أنشئ حسابًا" : "سجّل الدخول"}
              </button>
            </p>
          </div>
          <p className="mt-5 text-center text-xs leading-6 text-slate-500">بالمتابعة، توافق على استخدام حسابك للمصادقة وحماية جلسة أوريفون.</p>
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.42 38.04 47 31.88 47 24.55Z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1-.76-4.59c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.8 23.8 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" transform="translate(0 4)" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.88 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -4)" />
    </svg>
  );
}
