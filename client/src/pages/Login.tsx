import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { firebaseAuth, googleProvider } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";

type AuthMode = "signin" | "signup" | "phone";

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
    "auth/unauthorized-domain": "هذا النطاق غير مصرح في Firebase. أضف aurevion-project.vercel.app إلى Authorized domains.",
    "auth/api-key-not-valid": "مفتاح Firebase Web غير صالح أو مقيد على نطاق خاطئ. راجع قيود API Key.",
    "auth/invalid-api-key": "مفتاح Firebase Web غير صالح. حدّث إعدادات تطبيق Web في Firebase.",
    "auth/app-not-authorized": "تطبيق الويب غير مصرح له في Firebase. تحقق من إعدادات المشروع.",
    "auth/invalid-phone-number": "اكتب الرقم بصيغة دولية، مثل +9647xxxxxxxxx.",
    "auth/code-expired": "انتهت صلاحية الرمز. أرسل رمزاً جديداً.",
    "auth/invalid-verification-code": "رمز التحقق غير صحيح.",
  };
  return messages[code] ?? "تعذر تسجيل الدخول الآن. تحقق من إعداد Firebase وحاول مجددًا.";
}

async function createServerSession(user: User) {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/firebase/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
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
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);

  useEffect(() => {
    document.title = "تسجيل الدخول | AUREVION";
    return () => recaptchaRef.current?.clear();
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
    if (!termsAccepted) throw new Error("وافق على اتفاقية الاستخدام أولاً.");
    const credential = await signInWithPopup(firebaseAuth, googleProvider);
    await createServerSession(credential.user);
  });

  const sendPhoneCode = () => run(async () => {
    if (!termsAccepted) throw new Error("وافق على اتفاقية الاستخدام أولاً.");
    recaptchaRef.current?.clear();
    recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, "firebase-phone-recaptcha", { size: "invisible" });
    setConfirmation(await signInWithPhoneNumber(firebaseAuth, phone.trim(), recaptchaRef.current));
    setNotice("أرسلنا رمز تحقق إلى رقم هاتفك.");
  });

  const verifyPhoneCode = () => run(async () => {
    if (!confirmation) return;
    const credential = await confirmation.confirm(verificationCode.trim());
    await createServerSession(credential.user);
  });

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!termsAccepted) {
      setError("وافق على اتفاقية الاستخدام أولاً.");
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
      await createServerSession(credential.user);
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
              <h2 className="mt-3 text-2xl font-semibold text-white">{mode === "signup" ? "إنشاء حساب" : "تسجيل الدخول"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">اختر Google أو البريد الإلكتروني أو رقم الهاتف.</p>
            </div>

            <Button type="button" onClick={() => void signInWithGoogle()} disabled={busy} className="h-12 w-full border border-white/15 bg-white text-slate-900 hover:bg-slate-100">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleMark />}
              المتابعة باستخدام Google
            </Button>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-6 text-slate-300">
              <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} className="mt-1 border-cyan-300/50 data-[state=checked]:border-cyan-300 data-[state=checked]:bg-cyan-300 data-[state=checked]:text-slate-950" />
              <span>أوافق على <button type="button" className="font-medium text-cyan-200 underline underline-offset-2" onClick={(event) => { event.preventDefault(); setAgreementOpen(true); }}>اتفاقية الاستخدام وسياسة الخصوصية</button> الخاصة بـ AUREVION.</span>
            </label>

            <div className="my-6 grid grid-cols-2 gap-2"><Button type="button" variant={mode === "phone" ? "default" : "outline"} onClick={() => { setMode("phone"); setConfirmation(null); setError(""); setNotice(""); }}>الهاتف</Button><Button type="button" variant={mode !== "phone" ? "default" : "outline"} onClick={() => { setMode("signin"); setConfirmation(null); setError(""); setNotice(""); }}>البريد الإلكتروني</Button></div>

            {mode === "phone" ? <div className="space-y-4"><label className="block space-y-2 text-sm text-slate-300"><span>رقم الهاتف بصيغة دولية</span><Input type="tel" inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+9647xxxxxxxxx" dir="ltr" className="h-11 border-white/10 bg-white/[0.04] text-white placeholder:text-slate-600" /></label>{confirmation ? <><Input inputMode="numeric" required value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="رمز SMS" dir="ltr" className="h-11 border-white/10 bg-white/[0.04] text-white" /><Button type="button" disabled={busy} onClick={() => void verifyPhoneCode()} className="h-11 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}تأكيد الرمز</Button></> : <Button type="button" disabled={busy} onClick={() => void sendPhoneCode()} className="h-11 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}إرسال رمز التحقق</Button>}<div id="firebase-phone-recaptcha" /></div> : <form onSubmit={submitEmail} className="space-y-4">
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

              <Button type="submit" disabled={busy} className="h-11 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {mode === "signin" ? "دخول إلى أوريفون" : "إنشاء الحساب"}
              </Button>
            </form>}

            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm leading-6 text-rose-100">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-sm leading-6 text-emerald-100">{notice}</p>}

            <p className="mt-6 text-center text-sm text-slate-400">
              {mode === "phone" ? "" : mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
              <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }} className="font-medium text-cyan-200 hover:text-white">
                {mode === "signin" ? "أنشئ حسابًا" : "سجّل الدخول"}
              </button>
            </p>
          </div>
          <p className="mt-5 text-center text-xs leading-6 text-slate-500">بالمتابعة، توافق على استخدام حسابك للمصادقة وحماية جلسة أوريفون.</p>
        </div>
      </section>
      {agreementOpen ? <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/90 p-4" role="dialog" aria-modal="true" aria-labelledby="agreement-title"><article className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-300/25 bg-slate-950 p-6 text-left text-slate-200 shadow-2xl sm:p-8" dir="ltr"><div className="flex items-start justify-between gap-4"><div><p className="text-xs tracking-[0.2em] text-cyan-300/70">AUREVION / LEGAL</p><h2 id="agreement-title" className="mt-2 text-2xl font-semibold text-white">Terms of Use & Privacy Policy</h2></div><button type="button" onClick={() => setAgreementOpen(false)} className="text-2xl text-slate-400 hover:text-white" aria-label="Close agreement">×</button></div><div className="mt-6 space-y-5 text-sm leading-7 text-slate-300"><section><h3 className="font-semibold text-cyan-200">1. Acceptance</h3><p>By creating an account or using AUREVION, you agree to these Terms of Use and this Privacy Policy. If you do not agree, do not create an account or use the service.</p></section><section><h3 className="font-semibold text-cyan-200">2. Responsible use</h3><p>You must use AUREVION lawfully and responsibly. Do not use it for fraud, abuse, harassment, illegal activity, harmful content, or attempts to compromise the service or another person’s account.</p></section><section><h3 className="font-semibold text-cyan-200">3. AI-generated content</h3><p>AUREVION responses and generated media may be inaccurate or incomplete. You are responsible for reviewing outputs before relying on them. Do not treat the service as professional legal, medical, financial, or safety advice.</p></section><section><h3 className="font-semibold text-cyan-200">4. Accounts and security</h3><p>Keep your sign-in information secure and provide accurate account information. You are responsible for activity performed through your account. We may restrict access when necessary to protect users or the service.</p></section><section><h3 className="font-semibold text-cyan-200">5. Privacy</h3><p>We process account and service data to authenticate users, operate AUREVION, prevent abuse, provide support, and improve reliability. Authentication is handled through Firebase. We do not ask you to place provider secrets in the browser.</p></section><section><h3 className="font-semibold text-cyan-200">6. Service limitations</h3><p>The service is provided as available. Availability, response quality, limits, pricing, and supported features may change as AUREVION develops.</p></section><section><h3 className="font-semibold text-cyan-200">7. Contact</h3><p>For support or to report a problem, use the support and report options inside AUREVION.</p></section></div><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setAgreementOpen(false)} className="border-white/15">Close</Button><Button type="button" onClick={() => { setTermsAccepted(true); setAgreementOpen(false); }} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">I Agree</Button></div></article></div> : null}
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
