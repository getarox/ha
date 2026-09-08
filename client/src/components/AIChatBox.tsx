import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AudioLines,
  Volume2,
  Code2,
  FileText,
  Flag,
  Globe2,
  History,
  LifeBuoy,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  Settings2,
  Sparkles,
  Square,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

/** Browser APIs are intentionally structural so older browsers remain build-safe. */
type SpeechRecognitionResultLike = ArrayLike<ArrayLike<{ transcript: string }>>;
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: SpeechRecognitionResultLike }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;
type SpeechWindowLike = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
  /** Optional externally controlled live-search state, used by Home. */
  webSearch?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
};

export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  webSearch,
  onWebSearchChange,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [localWebSearch, setLocalWebSearch] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceChatting, setIsVoiceChatting] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [voicePreset, setVoicePreset] = useState("female");
  const [voiceLoading, setVoiceLoading] = useState<number | null>(null);
  const { user, logout } = useAuth();
  const effectiveWebSearch = webSearch ?? localWebSearch;
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const scrollAreaHeight = containerRef.current.offsetHeight - inputAreaRef.current.offsetHeight;
      setMinHeightForLastMessage(Math.max(0, scrollAreaHeight - 32 - 56));
    }
  }, []);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      speechRef.current?.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
    if (viewport) requestAnimationFrame(() => viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }));
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setSelectedFiles((current) => [...current, ...files].slice(-5));
    setRecordingStatus(`تم اختيار ${files.length} ملف محليًا — لن يتم رفعه تلقائيًا.`);
    event.target.value = "";
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingStatus("التسجيل الصوتي غير متاح في هذا المتصفح.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        setRecordingStatus("تم حفظ التسجيل محليًا. يمكنك الاستماع إليه قبل إرسال رسالتك.");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      setIsRecording(true);
      setRecordingStatus("جارٍ التسجيل محليًا… اضغط مرة أخرى للإيقاف.");
    } catch {
      setRecordingStatus("لم نتمكن من الوصول إلى الميكروفون. تحقق من إذن المتصفح.");
    }
  };

  const handleVoiceChat = () => {
    if (isVoiceChatting) {
      speechRef.current?.stop();
      return;
    }
    const speechWindow = window as SpeechWindowLike;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecordingStatus("المحادثة الصوتية غير مدعومة في هذا المتصفح.");
      return;
    }
    const recognition = new SpeechRecognition();
    let capturedTranscript = "";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || "ar-SA";
    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult?.[0]?.transcript?.trim();
      if (transcript) { capturedTranscript = transcript; setInput((current) => `${current} ${transcript}`.trim()); }
    };
    recognition.onend = () => {
      setIsVoiceChatting(false);
      if (capturedTranscript) { onSendMessage(capturedTranscript); setInput(""); setRecordingStatus("أرسلت رسالتك الصوتية، انتظر الرد الصوتي."); }
      else setRecordingStatus("لم ألتقط كلامًا واضحًا.");
    };
    recognition.onerror = () => {
      setIsVoiceChatting(false);
      setRecordingStatus("تعذر فهم الصوت. حاول مجددًا في مكان هادئ.");
    };
    speechRef.current = recognition;
    try {
      recognition.start();
      setIsVoiceChatting(true);
      setRecordingStatus("أستمع الآن… تحدث بوضوح.");
    } catch {
      setIsVoiceChatting(false);
      setRecordingStatus("تعذر بدء المحادثة الصوتية.");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedInput = input.trim();
    if ((!trimmedInput && selectedFiles.length === 0) || isLoading) return;
    const attachmentNote = selectedFiles.length
      ? `\n\n[مرفقات محلية: ${selectedFiles.map((file) => file.name).join(", ")}]`
      : "";
    onSendMessage(`${trimmedInput || "أرفقت ملفات للمراجعة."}${attachmentNote}`);
    setInput("");
    setSelectedFiles([]);
    scrollToBottom();
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const sendRecordedAudio = async () => {
    if (!audioBlob || isLoading) return;
    setRecordingStatus("جارٍ تحويل التسجيل إلى نص…");
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const encoded = String(reader.result).split(",")[1] ?? "";
        const response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: encoded, mimeType: audioBlob.type }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "تعذر تحويل التسجيل إلى نص.");
        if (data.text) { onSendMessage(data.text); setAudioBlob(null); setAudioUrl(null); setRecordingStatus("تم إرسال التسجيل."); }
      } catch (error: any) { setRecordingStatus(error?.message || "تعذر إرسال التسجيل."); }
    };
    reader.readAsDataURL(audioBlob);
  };

  const playAssistantVoice = async (text: string, index: number) => {
    setVoiceLoading(index);
    try {
      const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId: voicePreset }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر توليد الصوت.");
      await new Audio(`data:${data.contentType};base64,${data.audioBase64}`).play();
    } catch (error: any) { setRecordingStatus(error?.message || "تعذر تشغيل الصوت."); }
    finally { setVoiceLoading(null); }
  };

  return (
    <div ref={containerRef} className={cn("flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm", className)} style={{ height }}>
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
              <div className="flex flex-col items-center gap-3"><Sparkles className="size-12 opacity-20" /><p className="text-sm">{emptyStateMessage}</p></div>
              {suggestedPrompts && suggestedPrompts.length > 0 && <div className="flex max-w-2xl flex-wrap justify-center gap-2">{suggestedPrompts.map((prompt, index) => <button key={index} onClick={() => onSendMessage(prompt)} disabled={isLoading} className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">{prompt}</button>)}</div>}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full"><div className="flex flex-col space-y-4 p-4">
            {displayMessages.map((message, index) => {
              const isLastMessage = index === displayMessages.length - 1;
              const shouldApplyMinHeight = isLastMessage && !isLoading && minHeightForLastMessage > 0;
              return <div key={index} className={cn("flex items-start gap-3", message.role === "user" ? "justify-end" : "justify-start")} style={shouldApplyMinHeight ? { minHeight: `${minHeightForLastMessage}px` } : undefined}>
                {message.role === "assistant" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><Sparkles className="size-4 text-primary" /></div>}
                <div className={cn("max-w-[80%] rounded-lg px-4 py-2.5", message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{message.role === "assistant" ? <><div className="prose prose-sm dark:prose-invert max-w-none"><Streamdown>{message.content}</Streamdown></div><button type="button" onClick={() => void playAssistantVoice(message.content, index)} disabled={voiceLoading === index} className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100">{voiceLoading === index ? <Loader2 className="size-3 animate-spin" /> : <Volume2 className="size-3" />} استمع</button></> : <p className="whitespace-pre-wrap text-sm">{message.content}</p>}</div>
                {message.role === "user" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"><User className="size-4 text-secondary-foreground" /></div>}
              </div>;
            })}
            {isLoading && <div className="flex items-start gap-3" style={minHeightForLastMessage > 0 ? { minHeight: `${minHeightForLastMessage}px` } : undefined}><div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><Sparkles className="size-4 text-primary" /></div><div className="rounded-lg bg-muted px-4 py-2.5"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div></div>}
          </div></ScrollArea>
        )}
      </div>

      <form ref={inputAreaRef} onSubmit={handleSubmit} className="relative flex flex-col gap-3 border-t bg-background/50 p-4">
        {settingsOpen && <div className="absolute bottom-[calc(100%+0.75rem)] end-4 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-cyan-300/20 bg-slate-950/95 p-3 text-slate-200 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between border-b border-white/10 px-2 pb-3"><div><p className="text-sm font-semibold">إعدادات المحادثة</p><p className="mt-1 text-[11px] text-slate-500">تحكم سريع في تجربتك</p></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setSettingsOpen(false)} aria-label="إغلاق الإعدادات"><X className="size-4" /></Button></div>
          <div className="space-y-1">
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition hover:bg-white/[0.07]" onClick={() => setRecordingStatus("سيظهر سجل هذه الجلسة هنا قريبًا — رسائلك الحالية محفوظة محليًا.")}><History className="size-4 text-cyan-300" /><span className="flex-1">History</span><span className="text-[10px] text-slate-500">الجلسة الحالية</span></button>
            {user ? <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition hover:bg-white/[0.07]" onClick={() => void logout()}><LogOut className="size-4 text-cyan-300" /><span>تسجيل الخروج</span><span className="ms-auto max-w-24 truncate text-[10px] text-slate-500">{user.name || "الحساب"}</span></button> : <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition hover:bg-white/[0.07]" onClick={() => startLogin()}><LogIn className="size-4 text-cyan-300" /><span>تسجيل الدخول</span></button>}
            <a href="mailto:support@aurevion.ai" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/[0.07]"><LifeBuoy className="size-4 text-cyan-300" /><span>الدعم</span></a>
            <a href="mailto:report@aurevion.ai?subject=Aurevion%20report" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/[0.07]"><Flag className="size-4 text-cyan-300" /><span>الإبلاغ عن مشكلة</span></a>
            <a href="#plans" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/[0.07]"><FileText className="size-4 text-cyan-300" /><span>الخطط</span></a>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition hover:bg-white/[0.07]" onClick={() => setDeveloperMode((current) => !current)}><Code2 className="size-4 text-cyan-300" /><span className="flex-1">وضع Developer</span><span className={cn("h-5 w-9 rounded-full p-0.5 transition", developerMode ? "bg-cyan-300" : "bg-slate-700")}><span className={cn("block size-4 rounded-full bg-white transition", developerMode ? "translate-x-4" : "translate-x-0")} /></span></button>
          </div>
          <label className="mt-2 flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs"><span>نبرة الرد الصوتي</span><select value={voicePreset} onChange={(event) => setVoicePreset(event.target.value)} className="rounded bg-slate-800 px-2 py-1 text-xs"><option value="female">أنثى</option><option value="male">ذكر</option><option value="calm">هادئ</option></select></label>
          {developerMode && <p className="mt-2 rounded-lg bg-cyan-300/10 px-3 py-2 text-[11px] leading-5 text-cyan-100">وضع المطور مفعل محليًا. لا يتم إرسال أي مفاتيح أو بيانات إضافية.</p>}
        </div>}

        <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-cyan-300" onClick={() => fileInputRef.current?.click()} aria-label="إرفاق ملفات"><Paperclip className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground hover:text-cyan-300", isRecording && "bg-red-400/15 text-red-300 hover:text-red-200")} onClick={() => void handleRecordToggle()} aria-label={isRecording ? "إيقاف التسجيل" : "بدء التسجيل"} aria-pressed={isRecording}>{isRecording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}</Button>
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground hover:text-cyan-300", isVoiceChatting && "bg-cyan-300/15 text-cyan-200")} onClick={handleVoiceChat} aria-label="محادثة صوتية" aria-pressed={isVoiceChatting}><MessageCircle className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground hover:text-cyan-300", effectiveWebSearch && "bg-cyan-300/15 text-cyan-200")} onClick={() => (onWebSearchChange ? onWebSearchChange(!effectiveWebSearch) : setLocalWebSearch((current) => !current))} aria-label="تبديل البحث المباشر" aria-pressed={effectiveWebSearch}><Globe2 className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground hover:text-cyan-300", settingsOpen && "bg-cyan-300/15 text-cyan-200")} onClick={() => setSettingsOpen((current) => !current)} aria-label="فتح الإعدادات" aria-expanded={settingsOpen}><Settings2 className="size-4" /></Button>
        </div><div className="flex items-center gap-2 text-[10px] text-slate-500">{effectiveWebSearch && <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-cyan-200">بحث مباشر</span>}{selectedFiles.length > 0 && <span className="max-w-32 truncate text-cyan-200">{selectedFiles.length} مرفق</span>}</div></div>

        {(recordingStatus || audioUrl) && <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400"><AudioLines className="size-3.5 shrink-0 text-cyan-300" /><span className="min-w-0 flex-1 truncate">{recordingStatus || "تسجيل صوتي جاهز للإرسال"}</span>{audioUrl && <audio controls src={audioUrl} className="h-7 max-w-32" />} {audioBlob && <Button type="button" size="sm" onClick={() => void sendRecordedAudio()} disabled={isLoading} className="h-7 px-2 text-[11px]">إرسال</Button>}</div>}

        <div className="flex items-end gap-2"><Textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} className="min-h-9 max-h-32 flex-1 resize-none" rows={1} /><Button type="submit" size="icon" disabled={(!input.trim() && selectedFiles.length === 0) || isLoading} className="h-[38px] w-[38px] shrink-0">{isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button></div>
      </form>
    </div>
  );
}
