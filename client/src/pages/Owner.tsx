import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { startLogin } from "@/const";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowUpRight, BarChart3, Bot, CheckCircle2, Server, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

export default function Owner() {
  const { user, loading } = useAuth();
  const statsQuery = trpc.aurevion.ownerStats.useQuery(undefined, {
    enabled: user?.role === "admin",
    retry: false,
  });
  const healthQuery = trpc.aurevion.ownerHealth.useQuery(undefined, {
    enabled: user?.role === "admin",
    retry: false,
    refetchInterval: 60_000,
  });
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [planSessionId, setPlanSessionId] = useState("");
  const planMutation = trpc.aurevion.ownerSetPlan.useMutation({
    onSuccess: () => statsQuery.refetch(),
  });
  const [testSessionId] = useState(() => `owner-${crypto.randomUUID()}`);
  const testMutation = trpc.aurevion.chat.useMutation({
    onSuccess: (response) => setTestMessages((current) => [...current, { role: "assistant", content: response.reply }]),
    onError: (error) => setTestMessages((current) => [...current, { role: "assistant", content: `فشل الاختبار: ${error.message}` }]),
  });
  const handleTestSend = (content: string) => {
    const nextMessages: Message[] = [...testMessages, { role: "user", content }];
    const requestMessages = nextMessages.filter(
      (message): message is { role: "user" | "assistant"; content: string } => message.role !== "system",
    );
    setTestMessages(nextMessages);
    testMutation.mutate({ sessionId: testSessionId, messages: requestMessages, webSearch: false });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white" dir="rtl"><div className="text-center"><Bot className="mx-auto h-10 w-10 animate-pulse text-cyan-300" /><p className="mt-4 text-sm text-slate-400">جارٍ تجهيز لوحة أوريفون...</p></div></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white" dir="rtl">
        <div className="max-w-md text-center">
          <Bot className="mx-auto h-12 w-12 text-cyan-300" />
          <h1 className="mt-6 text-3xl font-semibold">لوحة مالك أوريفون</h1>
          <p className="mt-3 leading-7 text-slate-400">سجّل الدخول للوصول إلى حالة الخادم والحصص والإعدادات.</p>
          <Button onClick={() => startLogin()} className="mt-7 bg-cyan-300 text-slate-950 hover:bg-cyan-200">دخول المالك</Button>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
        <div className="mx-auto max-w-6xl space-y-7 p-3 sm:p-6">
          <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
            <div><div className="flex items-center gap-2 text-cyan-300"><Bot className="h-5 w-5" /><span className="eyebrow">AUREVION OWNER CONSOLE</span></div><h1 className="mt-3 text-3xl font-semibold tracking-tight">مركز قيادة أوريفون</h1><p className="mt-2 text-sm text-slate-400">مراقبة العقل الخادمي، الحصص، الخطط، والجاهزية للتكامل مع تطبيق Android.</p></div>
            <Link href="/"><Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">العودة للبوابة <ArrowUpRight className="mr-2 h-4 w-4" /></Button></Link>
          </header>

          {user.role !== "admin" ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-amber-100">هذا القسم مخصص لحساب المالك فقط.</div>
          ) : statsQuery.isLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">جارٍ تحميل حالة أوريفون...</div>
          ) : statsQuery.error ? (
            <div className="rounded-2xl border border-red-300/20 bg-red-300/10 p-5 text-red-100">تعذر تحميل بيانات لوحة المالك. تأكد من أن حسابك هو حساب المالك.</div>
          ) : statsQuery.data ? (
            <>
              <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">LIVE TEST</p><h2 className="mt-2 text-lg font-medium">اختبار عقل أوريفون</h2></div><span className="text-xs text-slate-500">لا يُعرض مفتاح Groq</span></div><AIChatBox messages={testMessages} onSendMessage={handleTestSend} isLoading={testMutation.isPending} height="300px" placeholder="اختبر سؤالًا من الخادم..." emptyStateMessage="أرسل أول سؤال لاختبار Groq" className="aurevion-chat" /></section>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[{label:"حالة الخادم",value:healthQuery.isLoading ? "يفحص..." : healthQuery.data?.ok ? "متصل" : "بحاجة مراجعة",icon:Server,accent:healthQuery.data?.ok ? "text-emerald-300" : "text-amber-300"},{label:"الجلسات",value:statsQuery.data.stats.sessions,icon:Activity,accent:"text-cyan-300"},{label:"الرسائل المستخدمة",value:statsQuery.data.stats.totalMessages,icon:BarChart3,accent:"text-violet-300"},{label:"النموذج",value:statsQuery.data.model,icon:Sparkles,accent:"text-amber-300"}].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><item.icon className={`h-5 w-5 ${item.accent}`} /><p className="mt-5 text-xs text-slate-500">{item.label}</p><p className="mt-2 truncate text-xl font-semibold text-white">{item.value}</p></div>)}
              </section>
              <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-cyan-300" /><h2 className="text-lg font-medium">هوية المنصة</h2></div><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between gap-4 border-b border-white/10 pb-3"><dt className="text-slate-500">العقل</dt><dd className="text-left text-slate-200">{statsQuery.data.identity}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">الموقع الرسمي</dt><dd><a className="inline-flex items-center gap-1 text-cyan-300 hover:text-white" href={statsQuery.data.officialSiteUrl} target="_blank" rel="noreferrer">فتح الموقع <ArrowUpRight className="h-3.5 w-3.5" /></a></dd></div></dl></div>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-6"><h2 className="text-lg font-medium">الخطط والحصص</h2><div className="mt-5 space-y-3">{statsQuery.data.plans.map((plan) => <div key={plan.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 p-4"><div><p className="font-medium">{plan.name}</p><p className="mt-1 text-xs text-slate-500">حصة الرسائل اليومية</p></div><span className="font-mono text-cyan-200">{plan.messages}</span></div>)}</div><div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4"><p className="text-xs text-slate-400">تخصيص خطة جهاز/جلسة</p><Input value={planSessionId} onChange={(event) => setPlanSessionId(event.target.value)} placeholder="معرّف الجلسة" className="mt-2 border-white/10 bg-white/5 text-white" /><div className="flex gap-2"><Button size="sm" disabled={planMutation.isPending || planSessionId.length < 8} onClick={() => planMutation.mutate({ sessionId: planSessionId, plan: "free" })} variant="outline" className="border-white/15 bg-white/5 text-white">مجانية</Button><Button size="sm" disabled={planMutation.isPending || planSessionId.length < 8} onClick={() => planMutation.mutate({ sessionId: planSessionId, plan: "pro" })} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">احترافية</Button></div></div><p className="mt-5 text-xs leading-5 text-slate-500">الدفع الحقيقي يحتاج ربط Stripe أو مزود دفع آخر. هذه الأداة مخصصة لتجهيز الأجهزة أو منح الخطة بعد تحقق الدفع من مزود خارجي.</p></div>
              </section>
              <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm sm:grid-cols-3"><div><p className="text-xs text-slate-500">Groq</p><p className={healthQuery.data?.groqReachable ? "mt-2 text-emerald-200" : "mt-2 text-amber-200"}>{healthQuery.data?.groqReachable ? "متاح" : "غير متحقق"}</p></div><div><p className="text-xs text-slate-500">حماية Android</p><p className={healthQuery.data?.clientProtectionConfigured ? "mt-2 text-emerald-200" : "mt-2 text-amber-200"}>{healthQuery.data?.clientProtectionConfigured ? "مفعّلة" : "غير مفعّلة"}</p></div><div><p className="text-xs text-slate-500">آخر فحص</p><p className="mt-2 text-slate-300">{healthQuery.data?.checkedAt ? new Date(healthQuery.data.checkedAt).toLocaleTimeString("ar-IQ") : "بانتظار الفحص"}</p></div></div><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> مفتاح Groq لا يخرج من الخادم. لا ترفع `harth.txt` إلى المستودع أو APK.</div>
            </>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
