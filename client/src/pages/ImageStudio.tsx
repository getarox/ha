import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, ImagePlus, Loader2, Sparkles, Upload, WandSparkles } from "lucide-react";

const modes = [
  { id: "generate", label: "بناء صورة", hint: "أنشئ صورة من وصفك" },
  { id: "edit", label: "تحرير صورة", hint: "عدّل صورة بمرجع وتعليمات" },
  { id: "analyze", label: "تحليل", hint: "افهم محتوى الصورة" },
  { id: "evaluate", label: "تقييم", hint: "قيّم التصميم والنتيجة" },
] as const;

export default function ImageStudio() {
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("generate");
  const [prompt, setPrompt] = useState("");
  const [imageBase64, setImageBase64] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [pro, setPro] = useState(false);
  const [sessionId] = useState(() => `studio-${crypto.randomUUID()}`);
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = trpc.aurevion.imageStudio.useMutation();

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setImageBase64(value);
      setPreviewUrl(value);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    mutation.mutate({ sessionId, mode, prompt: prompt.trim(), imageBase64, pro });
  };

  const needsImage = mode !== "generate";

  return (
    <main className="min-h-screen bg-[#030711] px-4 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end">
          <div>
            <p className="eyebrow text-cyan-200">AUREVION IMAGE STUDIO</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">استوديو الصور</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-400">ابنِ صورة من فكرتك، حرّر صورة مرجعية، أو اطلب من أوريفون تحليل النتيجة وتقييمها. المفاتيح تبقى في الخادم ولا تصل إلى المتصفح.</p>
          </div>
          <a className="inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-white" href="/">العودة إلى البوابة <ArrowUpRight className="h-4 w-4" /></a>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
            <div className="flex items-center gap-3"><WandSparkles className="h-5 w-5 text-cyan-200" /><h2 className="text-xl font-medium">اختر العملية</h2></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {modes.map((item) => <button key={item.id} onClick={() => setMode(item.id)} className={`rounded-2xl border p-4 text-right transition ${mode === item.id ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-slate-950/30 hover:border-white/25"}`}><p className="font-medium">{item.label}</p><p className="mt-2 text-xs text-slate-500">{item.hint}</p></button>)}
            </div>

            <label className="mt-7 block text-sm text-slate-300">الوصف أو طلب التعديل</label>
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === "generate" ? "مثال: رأس أوريفون الروبوتي بإضاءة زرقاء نيون وخلفية سوداء سينمائية..." : "مثال: اجعل الخلفية ليلية وحافظ على شكل الوجه كما هو..."} className="mt-2 min-h-36 border-white/10 bg-slate-950/60 text-white placeholder:text-slate-600" />

            <div className="mt-5 rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.035] p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{needsImage ? "أضف صورة مرجعية" : "صورة مرجعية اختيارية"}</p><p className="mt-1 text-xs text-slate-500">PNG أو JPG، وبحد أقصى 20MB</p></div><Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="border-white/15 bg-white/5 text-white"><Upload className="ml-2 h-4 w-4" /> رفع صورة</Button></div>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
              {previewUrl && <img src={previewUrl} alt="الصورة المرجعية" className="mt-4 max-h-56 w-full rounded-xl object-contain" />}
            </div>

            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-300"><input type="checkbox" checked={pro} onChange={(event) => setPro(event.target.checked)} className="h-4 w-4 accent-cyan-300" /> استخدام وضع Banana Pro <span className="mr-auto text-xs text-amber-200">لخطة Pro</span></label>
            <Button onClick={handleSubmit} disabled={mutation.isPending || !prompt.trim() || (needsImage && !imageBase64)} className="mt-5 h-12 w-full bg-cyan-300 text-base font-semibold text-slate-950 hover:bg-cyan-200">{mutation.isPending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جارٍ التنفيذ...</> : <><Sparkles className="ml-2 h-4 w-4" /> تنفيذ العملية</>}</Button>
            {mutation.error && <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{mutation.error.message}</p>}
          </div>

          <div className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.08] to-transparent p-5 sm:p-7">
            <div className="flex items-center gap-3"><ImagePlus className="h-5 w-5 text-cyan-200" /><h2 className="text-xl font-medium">نتيجة أوريفون</h2></div>
            {!mutation.data && <div className="mt-6 flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/45 p-8 text-center"><div className="robot-orb robot-orb-small"><span /><span /></div><p className="mt-8 text-lg text-slate-300">ستظهر النتيجة هنا</p><p className="mt-2 max-w-sm text-sm leading-7 text-slate-500">اكتب طلبًا واضحًا، واختر العملية المناسبة. في وضع Pro تحصل على نموذج Banana Pro عند تفعيل خطتك.</p></div>}
            {mutation.data && <div className="mt-6 space-y-4"><div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 text-sm leading-8 text-slate-200 whitespace-pre-wrap">{mutation.data.text}</div>{mutation.data.kind === "image" && mutation.data.imageDataUrl && <img src={mutation.data.imageDataUrl} alt="نتيجة مولدة من أوريفون" className="w-full rounded-2xl border border-white/10 object-contain" />}<div className="flex items-center justify-between text-xs text-slate-500"><span>النموذج: {mutation.data.model}</span><span>المتبقي: {mutation.data.remaining}</span></div></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
