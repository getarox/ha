import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Menu,
  Radio,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

type FaceState = "idle" | "listening" | "thinking" | "replying";

const faceCopy: Record<FaceState, { label: string; detail: string }> = {
  idle: { label: "جاهز", detail: "أوريفون في وضع الاستعداد" },
  listening: { label: "يستمع", detail: "أفهم رسالتك الآن" },
  thinking: { label: "يفكر", detail: "أحلل السؤال وأبني الرد" },
  replying: { label: "يرد", detail: "أوريفون يتحدث معك" },
};

function getSessionId() {
  if (typeof window === "undefined") return "aurevion-preview-session";
  const storageKey = "aurevion-session-id";
  const current = window.localStorage.getItem(storageKey);
  if (current) return current;
  const next = crypto.randomUUID();
  window.localStorage.setItem(storageKey, next);
  return next;
}

function RobotFace({ state }: { state: FaceState }) {
  return (
    <div className={`robot-face robot-face-${state}`} aria-label={`حالة أوريفون: ${faceCopy[state].label}`}>
      <div className="robot-face-glow" />
      <div className="robot-antenna robot-antenna-left" />
      <div className="robot-antenna robot-antenna-right" />
      <div className="robot-eye robot-eye-left"><span /></div>
      <div className="robot-eye robot-eye-right"><span /></div>
      <div className="robot-face-mouth" />
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [faceState, setFaceState] = useState<FaceState>("idle");
  const [sessionId] = useState(getSessionId);
  const [chatPending, setChatPending] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paymentPending, setPaymentPending] = useState<number | null>(null);

  const status = faceCopy[faceState];
  const messageCount = useMemo(() => messages.filter((message) => message.role === "user").length, [messages]);

  useEffect(() => {
    void fetch(`/api/wallet?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data && typeof data.balance === "number") setWalletBalance(data.balance); })
      .catch(() => undefined);
  }, [sessionId]);

  const startTopUp = async (amount: number) => {
    if (paymentPending) return;
    setPaymentPending(amount);
    try {
      const response = await fetch("/api/payments/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, amount, description: `AUREVION wallet top-up ${amount} SAR` }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.redirectUrl !== "string") throw new Error(data.error || "تعذر إنشاء عملية الدفع.");
      window.location.href = data.redirectUrl;
    } catch (error: any) {
      window.alert(error?.message || "تعذر إنشاء عملية الدفع.");
    } finally {
      setPaymentPending(null);
    }
  };

  const handleSend = (content: string) => {
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    const requestMessages = nextMessages.filter(
      (message): message is { role: "user" | "assistant"; content: string } => message.role !== "system",
    );
    setMessages(nextMessages);
    try {
      const history = JSON.parse(localStorage.getItem("aurevion-session-history") || "[]") as Array<{ title: string; date: string; count: number }>;
      const nextHistory = [{ title: content.slice(0, 80), date: new Date().toISOString(), count: requestMessages.length }, ...history].slice(0, 20);
      localStorage.setItem("aurevion-session-history", JSON.stringify(nextHistory));
    } catch { /* local history is optional */ }
    setFaceState("listening");
    setChatPending(true);
    setFaceState("thinking");
    void fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, messages: requestMessages, webSearch: true }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر إكمال الطلب الآن.");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
      void fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: data.reply, voiceId: "female" }) })
        .then(async (voiceResponse) => { if (!voiceResponse.ok) return; const voice = await voiceResponse.json(); await new Audio(`data:${voice.contentType};base64,${voice.audioBase64}`).play(); })
        .catch(() => undefined);
      setFaceState("replying");
      window.setTimeout(() => setFaceState("idle"), 900);
    }).catch((error: any) => {
      setMessages((current) => [...current, { role: "assistant", content: `تعذر إكمال الطلب الآن. ${error?.message || "حاول مرة أخرى."}` }]);
      setFaceState("idle");
    }).finally(() => setChatPending(false));
  };

  return (
    <div className="aurevion-shell min-h-screen overflow-hidden text-white" dir="rtl">
      <div className="aurevion-noise" />
      <header className="aurevion-header relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="العودة إلى بوابة أوريفون">
          <span className="brand-mark"><Bot className="h-5 w-5" /></span>
          <span>
            <span className="block text-sm font-semibold tracking-[0.18em] text-white">AUREVION</span>
            <span className="block text-[10px] uppercase tracking-[0.28em] text-cyan-300/60">open robotic intelligence</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <a href="#brain" className="transition hover:text-cyan-300">العقل</a>
          <a href="#conversation" className="transition hover:text-cyan-300">المحادثة</a>
          <a href="#plans" className="transition hover:text-cyan-300">الخطط</a>
          <Link href="/studio" className="transition hover:text-cyan-300">استوديو الصور</Link>
          <a href="https://aurevion-two.vercel.app/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 transition hover:text-white">الموقع الرسمي <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </nav>
        <div className="flex items-center gap-2">
          <a href="#plans"><Button variant="outline" className="border-cyan-400/30 bg-white/5 text-cyan-100 hover:bg-cyan-300/10">الخطط</Button></a>
          {user?.role === "admin" ? <Link href="/owner" className="hidden sm:block"><Button variant="outline" className="border-cyan-400/30 bg-white/5 text-cyan-100 hover:bg-cyan-300/10">لوحة المالك</Button></Link> : null}
          {!user ? <Button onClick={() => startLogin()} className="hidden bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:inline-flex">دخول المالك</Button> : null}
          <Button variant="ghost" size="icon" className="text-slate-300 md:hidden" aria-label="فتح القائمة"><Menu className="h-5 w-5" /></Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 lg:px-8">
        <section id="brain" className="grid min-h-[620px] items-center gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="order-2 max-w-2xl lg:order-1">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <Badge className="border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-cyan-200 hover:bg-cyan-300/10"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /> بوابة أوريفون الرسمية</Badge>
              <span className="text-xs tracking-[0.2em] text-slate-500">GROQ POWERED / OPEN SOURCE</span>
            </div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.06em] text-white sm:text-7xl">العقل الذي يمنح<br /><span className="aurevion-gradient-text">AUREVION</span> حياة.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">أوريفون عقل روبوتي مفتوح المصدر مبني على Groq، مصمم ليكون الرفيق الذكي لهاتف AUREVION الروبوتي؛ يفهم، يحلل، يبحث، ويستجيب لك بطريقة إنسانية.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#conversation"><Button size="lg" className="bg-cyan-300 px-6 text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.2)] hover:bg-cyan-200">جرّب العقل <ArrowUpRight className="mr-2 h-4 w-4" /></Button></a>
              <Link href="/studio"><Button size="lg" variant="outline" className="border-cyan-300/25 bg-cyan-300/[0.04] px-6 text-cyan-100 hover:bg-cyan-300/10">استوديو الصور <Sparkles className="mr-2 h-4 w-4" /></Button></Link>
              <a href="https://aurevion-two.vercel.app/" target="_blank" rel="noreferrer"><Button size="lg" variant="outline" className="border-white/15 bg-white/[0.03] px-6 text-white hover:bg-white/10">زيارة الموقع الرسمي</Button></a>
            </div>
            <div className="mt-12 grid max-w-xl grid-cols-3 gap-5 border-t border-white/10 pt-6">
              <div><div className="text-xl font-semibold text-cyan-200">24/7</div><div className="mt-1 text-xs text-slate-500">عقل متصل</div></div>
              <div><div className="text-xl font-semibold text-cyan-200">12</div><div className="mt-1 text-xs text-slate-500">رسالة في السياق</div></div>
              <div><div className="text-xl font-semibold text-cyan-200">∞</div><div className="mt-1 text-xs text-slate-500">مساحة للأفكار</div></div>
            </div>
          </div>

          <div className="order-1 flex min-h-[460px] items-center justify-center lg:order-2">
            <div className="robot-stage">
              <div className="robot-stage-grid" />
              <div className="robot-stage-ring robot-stage-ring-one" />
              <div className="robot-stage-ring robot-stage-ring-two" />
              <RobotFace state={faceState} />
              <div className="robot-stage-caption"><Radio className="h-3.5 w-3.5 text-cyan-300" /><span>{status.label}</span><span className="text-slate-600">/</span><span className="text-slate-400">{status.detail}</span></div>
            </div>
          </div>
        </section>

        <section id="conversation" className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="aurevion-panel flex flex-col justify-between p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between"><span className="eyebrow">01 / THE BRAIN</span><BrainCircuit className="h-5 w-5 text-cyan-300" /></div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">تحدث معه<br /><span className="text-cyan-200">بلا تعقيد.</span></h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">اسأل، اطلب، شارك شعورك أو اطلب منه البحث. سياقك محفوظ لهذه الجلسة فقط، ومفتاح Groq لا يغادر الخادم.</p>
            </div>
            <div className="mt-10 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4"><span className="text-sm text-slate-300">رسائل الجلسة</span><span className="font-mono text-sm text-cyan-200">{messageCount}</span></div>
            </div>
          </div>
          <div className="aurevion-chat-wrap">
            <div className="mb-3 flex items-center justify-between px-1"><span className="eyebrow">LIVE CONVERSATION</span><span className="flex items-center gap-2 text-xs text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> اتصال محمي</span></div>
            <AIChatBox messages={messages} onSendMessage={handleSend} isLoading={chatPending} height="520px" placeholder="اكتب لأوريفون أي شيء..." emptyStateMessage="ابدأ محادثة مع العقل الروبوتي" suggestedPrompts={["من أنت؟", "ساعدني أخطط لمشروعي", "أنا أشعر بالحزن اليوم"]} className="aurevion-chat" />
          </div>
        </section>

        <section id="plans" className="py-20">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><span className="eyebrow">02 / BUILT TO GROW</span><h2 className="mt-3 text-3xl font-semibold tracking-tight">عقل مفتوح، <span className="text-cyan-200">مسار واضح.</span></h2></div><p className="max-w-md text-sm leading-6 text-slate-400">تبدأ بخطة مجانية للتجربة، وتنتقل إلى حصة أعلى عندما يكبر استخدامك. فواتير Groq منفصلة عن خطط أوريفون.</p></div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4"><div><p className="text-sm font-medium text-cyan-100">نظام الاستخدام</p><p className="mt-1 text-xs text-slate-400">المحادثة الأساسية مجانية. المهام الثقيلة تستخدم رصيد الخطط.</p></div><div className="text-sm text-slate-300">الرصيد: <span className="font-semibold text-cyan-200">{walletBalance === null ? "—" : `${walletBalance.toFixed(2)} SAR`}</span></div></div>
          <div className="grid gap-4 md:grid-cols-3">
            {[{name:"مجاني", value:"25", note:"رسالة / يوم + 3 صور", icon:Sparkles, featured:false, amount:0}, {name:"رصيد 25", value:"25 SAR", note:"للمهام الثقيلة", icon:Zap, featured:true, amount:25}, {name:"رصيد 100", value:"100 SAR", note:"للاستخدام المكثف", icon:ShieldCheck, featured:false, amount:100}].map((plan) => <div key={plan.name} className={`aurevion-plan ${plan.featured ? "aurevion-plan-featured" : ""}`}><plan.icon className="h-5 w-5 text-cyan-200" /><h3 className="mt-8 text-xl font-medium">{plan.name}</h3><div className="mt-4 text-3xl font-semibold text-white">{plan.value}</div><p className="mt-1 text-sm text-slate-500">{plan.note}</p><div className="mt-8 flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> دفع آمن وتحديث تلقائي للرصيد</div>{plan.amount > 0 ? <Button onClick={() => void startTopUp(plan.amount)} disabled={paymentPending !== null} className="mt-6 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">{paymentPending === plan.amount ? "جارٍ التحويل..." : `شراء ${plan.amount} SAR`}</Button> : <p className="mt-6 text-center text-xs text-slate-500">يبدأ بلا بطاقة</p>}</div>)}
          </div>
        </section>

        <footer className="flex flex-col justify-between gap-5 border-t border-white/10 py-8 text-xs text-slate-500 sm:flex-row sm:items-center"><div><span className="font-semibold tracking-[0.2em] text-slate-300">AUREVION</span><span className="mx-2 text-slate-700">/</span> أوريفون عقل روبوتي مفتوح المصدر مبني على Groq</div><div className="flex flex-wrap gap-5"><span>المطور: حارث عبدالله الجبوري</span><a className="text-cyan-300 hover:text-white" href="https://aurevion-two.vercel.app/" target="_blank" rel="noreferrer">الموقع الرسمي ↗</a></div></footer>
      </main>
    </div>
  );
}
