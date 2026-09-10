import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AudioLines,
  Volume2,
  ImagePlus,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
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
  imageUrl?: string;
  sources?: Array<{ title: string; url: string; snippet: string; source: string }>;
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
  onGenerateImage?: (prompt: string) => void | Promise<void>;
  onAnalyzeImage?: (imageDataUrl: string, prompt: string) => void | Promise<void>;
  voicePreset?: "female" | "male" | "calm";
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
  onGenerateImage,
  onAnalyzeImage,
  voicePreset = "female",
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceChatting, setIsVoiceChatting] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [voiceLoading, setVoiceLoading] = useState<number | null>(null);
  const voiceCallTimerRef = useRef<number | null>(null);
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
      if (voiceCallTimerRef.current) window.clearTimeout(voiceCallTimerRef.current);
    };
  }, []);

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
    if (viewport) requestAnimationFrame(() => viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }));
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const accepted = files.filter((file) => file.size <= (file.type.startsWith("image/") ? 4 : 10) * 1024 * 1024);
    if (accepted.length < files.length) setRecordingStatus("تم تجاهل ملف يتجاوز 10MB.");
    setSelectedFiles((current) => [...current, ...accepted].slice(-5));
    setRecordingStatus(`تم اختيار ${files.length} ملف محليًا — لن يتم رفعه تلقائيًا.`);
    event.target.value = "";
  };

  const handleRecordToggle = async () => {
    if (recorderRef.current?.state === "recording" || isRecording) {
      recorderRef.current?.stop();
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
        setIsRecording(false);
        recorderRef.current = null;
        audioChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        void sendRecordedAudio(blob);
      };
      recorder.start();
      setIsRecording(true);
      setRecordingStatus("");
    } catch {
      setRecordingStatus("لم نتمكن من الوصول إلى الميكروفون. اسمح باستخدام الميكروفون ثم حاول مرة أخرى.");
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
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || "ar-SA";
    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult?.[0]?.transcript?.trim();
      if (transcript) { capturedTranscript = transcript; setInput((current) => `${current} ${transcript}`.trim()); }
    };
    recognition.onend = () => {
      setIsVoiceChatting(false);
      if (voiceCallTimerRef.current) window.clearTimeout(voiceCallTimerRef.current);
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
      setRecordingStatus("محادثة صوتية مباشرة — الحد الأقصى 5 دقائق.");
      voiceCallTimerRef.current = window.setTimeout(() => { recognition.stop(); setRecordingStatus("انتهت مدة المحادثة الصوتية المجانية (5 دقائق)."); }, 5 * 60 * 1000);
    } catch {
      setIsVoiceChatting(false);
      setRecordingStatus("تعذر بدء المحادثة الصوتية.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedInput = input.trim();
    if ((!trimmedInput && selectedFiles.length === 0) || isLoading) return;
    const files = [...selectedFiles];
    const textFiles = files.filter((file) => !file.type.startsWith("image/")).slice(0, 3);
    const textParts = await Promise.all(textFiles.map(async (file) => `${file.name}:\n${(await file.text()).slice(0, 5000)}`));
    const attachmentText = textParts.length ? `\n\n[محتوى المرفقات]\n${textParts.join("\n\n")}` : "";
    const imageFile = files.find((file) => file.type.startsWith("image/"));
    if (imageFile && onAnalyzeImage) {
      const imageDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("تعذر قراءة الصورة.")); reader.readAsDataURL(imageFile); });
      const prompt = trimmedInput || "حلل هذه الصورة واذكر أهم التفاصيل والملاحظات.";
      setInput(""); setSelectedFiles([]); setRecordingStatus("جارٍ تحليل الصورة…");
      await onAnalyzeImage(imageDataUrl, prompt);
      return;
    }
    onSendMessage(`${trimmedInput || "أرفقت ملفات للمراجعة."}${attachmentText}`);
    setInput("");
    setSelectedFiles([]);
    scrollToBottom();
    textareaRef.current?.focus();
  };

  const handleGenerateImage = () => {
    const prompt = input.trim();
    if (!prompt || isLoading || !onGenerateImage) {
      setRecordingStatus("اكتب وصف الصورة أولًا، ثم اضغط إنشاء صورة.");
      textareaRef.current?.focus();
      return;
    }
    setInput("");
    void onGenerateImage(prompt);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const sendRecordedAudio = async (recordedBlob: Blob) => {
    if (isLoading) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const encoded = String(reader.result).split(",")[1] ?? "";
        const response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: encoded, mimeType: recordedBlob.type }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "تعذر تحويل التسجيل إلى نص.");
        if (data.text) onSendMessage(data.text);
      } catch (error: any) { setRecordingStatus(error?.message || "تعذر إرسال التسجيل."); }
    };
    reader.readAsDataURL(recordedBlob);
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
                <div className={cn("max-w-[80%] rounded-lg px-4 py-2.5", message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{message.role === "assistant" ? <><div className="prose prose-sm dark:prose-invert max-w-none"><Streamdown>{message.content}</Streamdown></div>{message.imageUrl && <img src={message.imageUrl} alt="صورة منشأة داخل المحادثة" loading="lazy" className="mt-3 max-h-[28rem] w-full rounded-xl border border-white/10 object-contain" />} {message.sources && message.sources.length > 0 && <div className="mt-4 space-y-2 border-t border-white/10 pt-3"><p className="text-[11px] font-semibold text-cyan-200">مصادر البحث</p>{message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 bg-black/10 p-2 text-[11px] transition hover:border-cyan-300/40"><span className="block truncate text-slate-200">{source.title}</span><span className="mt-1 block line-clamp-2 text-slate-500">{source.snippet}</span><span className="mt-1 block text-cyan-300/70">{source.source}</span></a>)}</div>}<button type="button" onClick={() => void playAssistantVoice(message.content, index)} disabled={voiceLoading === index} className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100">{voiceLoading === index ? <Loader2 className="size-3 animate-spin" /> : <Volume2 className="size-3" />} استمع</button></> : <p className="whitespace-pre-wrap text-sm">{message.content}</p>}</div>
                {message.role === "user" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"><User className="size-4 text-secondary-foreground" /></div>}
              </div>;
            })}
            {isLoading && <div className="flex items-start gap-3" style={minHeightForLastMessage > 0 ? { minHeight: `${minHeightForLastMessage}px` } : undefined}><div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><Sparkles className="size-4 text-primary" /></div><div className="rounded-lg bg-muted px-4 py-2.5"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div></div>}
          </div></ScrollArea>
        )}
      </div>

      <form ref={inputAreaRef} onSubmit={handleSubmit} className="relative flex flex-col gap-3 border-t bg-background/50 p-4">




        <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-cyan-300" onClick={() => fileInputRef.current?.click()} aria-label="إرفاق ملفات"><Paperclip className="size-4" /></Button>
          {onGenerateImage && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-cyan-300" onClick={handleGenerateImage} aria-label="إنشاء صورة من الوصف" title="إنشاء صورة من الوصف"><ImagePlus className="size-4" /></Button>}
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground hover:text-cyan-300", isRecording && "bg-red-400/15 text-red-300 hover:text-red-200")} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); void handleRecordToggle(); }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture?.(event.pointerId); if (recorderRef.current?.state === "recording") void handleRecordToggle(); }} onPointerCancel={() => { if (recorderRef.current?.state === "recording") void handleRecordToggle(); }} onPointerLeave={(event) => { if (recorderRef.current?.state === "recording" && event.buttons === 0) void handleRecordToggle(); }} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !isRecording) { event.preventDefault(); void handleRecordToggle(); } }} onKeyUp={(event) => { if ((event.key === "Enter" || event.key === " ") && recorderRef.current?.state === "recording") { event.preventDefault(); void handleRecordToggle(); } }} aria-label={isRecording ? "ارفع إصبعك لإرسال التسجيل" : "اضغط باستمرار للتسجيل"} aria-pressed={isRecording}>{isRecording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}</Button>
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 text-muted-foreground hover:text-cyan-300", isVoiceChatting && "bg-cyan-300/15 text-cyan-200")} onClick={handleVoiceChat} aria-label="محادثة صوتية لمدة خمس دقائق" aria-pressed={isVoiceChatting}><MessageCircle className="size-4" /></Button>
        </div><div className="flex items-center gap-2 text-[10px] text-slate-500">{selectedFiles.length > 0 && <span className="max-w-32 truncate text-cyan-200">{selectedFiles.length} مرفق</span>}</div></div>

        {recordingStatus && <div role="status" className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400"><AudioLines className="size-3.5 shrink-0 text-cyan-300" /><span className="min-w-0 flex-1 truncate">{recordingStatus}</span></div>}

        <div className="flex items-end gap-2"><Textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} className="min-h-9 max-h-32 flex-1 resize-none" rows={1} /><Button type="submit" size="icon" disabled={(!input.trim() && selectedFiles.length === 0) || isLoading} className="h-[38px] w-[38px] shrink-0">{isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button></div>
      </form>
    </div>
  );
}
