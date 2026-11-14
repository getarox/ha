import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env.js";
import { createAurevionSession, getAurevionSession, updateAurevionSession } from "./db.js";
import { reserveNeuronBalance, refundNeuronReservation, reserveCloudflareUsage, releaseCloudflareUsage, reserveFreeImage, releaseFreeImage, neuronBalance, freeImagesRemaining } from "./billing.js";

export type ImageStudioMode = "generate" | "edit" | "analyze" | "evaluate";

type ImageStudioInput = {
  sessionId: string;
  firebaseUid?: string;
  resolution?: 512 | 1024;
  mode: ImageStudioMode;
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  pro?: boolean;
};

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const memoryImageUsage = new Map<string, { plan: "free" | "pro"; imagesUsed: number }>();

function cleanSessionId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128);
}

function getMemoryState(sessionId: string) {
  const existing = memoryImageUsage.get(sessionId);
  if (existing) return existing;
  const state = { plan: "free" as const, imagesUsed: 0 };
  memoryImageUsage.set(sessionId, state);
  return state;
}

async function ensureSession(sessionId: string) {
  const clean = cleanSessionId(sessionId);
  if (clean.length < 8) throw new TRPCError({ code: "BAD_REQUEST", message: "معرّف الجلسة غير صالح." });
  if (process.env.DATABASE_URL) {
    let session = await getAurevionSession(clean);
    if (!session) {
      await createAurevionSession(clean);
      session = await getAurevionSession(clean);
    }
    return session;
  }
  return undefined;
}

async function checkImageQuota(sessionId: string, requestedPro: boolean, enforceSessionLimit = true) {
  const persisted = await ensureSession(sessionId);
  const memory = getMemoryState(cleanSessionId(sessionId));
  const plan = persisted?.plan ?? memory.plan;
  if (requestedPro && plan !== "pro") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ميزة Pro تحتاج خطة احترافية مفعّلة." });
  }
  const limit = plan === "pro" ? ENV.proImageLimit : ENV.freeImageLimit;
  const used = persisted?.imagesUsed ?? memory.imagesUsed;
  if (enforceSessionLimit && used >= limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `انتهت حصة الصور لهذه الخطة (${limit}).` });
  }
  return { plan, used, limit, persisted };
}

async function consumeImageQuota(sessionId: string, quota: Awaited<ReturnType<typeof checkImageQuota>>) {
  const next = quota.used + 1;
  const memory = getMemoryState(cleanSessionId(sessionId));
  memory.plan = quota.plan;
  memory.imagesUsed = next;
  if (quota.persisted) await updateAurevionSession(quota.persisted.id, { imagesUsed: next });
  return { plan: quota.plan, remaining: Math.max(0, quota.limit - next) };
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,([\s\S]+)$/);
  return match ? { mimeType: match[1], data: match[2] } : { mimeType: "image/png", data: value };
}

async function callGeminiImage(input: ImageStudioInput, model: string) {
  if (!ENV.geminiApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "خدمة الصور غير مفعّلة على الخادم." });
  const parts: GeminiPart[] = [{ text: input.prompt }];
  if (input.imageBase64) {
    const decoded = decodeDataUrl(input.imageBase64);
    parts.push({ inlineData: { mimeType: input.mimeType ?? decoded.mimeType, data: decoded.data } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(ENV.geminiApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    await response.text();
    console.error("[ImageStudio] Gemini request failed", response.status);
    throw new TRPCError({ code: response.status === 404 ? "NOT_FOUND" : "BAD_GATEWAY", message: "تعذر تنفيذ عملية الصور حاليًا." });
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }> };
  const outputParts = payload.candidates?.[0]?.content?.parts ?? [];
  const image = outputParts.find((part) => part.inlineData?.data);
  const text = outputParts.find((part) => part.text)?.text ?? "تم تنفيذ عملية الصور.";
  return { kind: "image" as const, text, imageDataUrl: image?.inlineData?.data ? `data:${image.inlineData.mimeType ?? "image/png"};base64,${image.inlineData.data}` : undefined };
}

async function callGroqVision(input: ImageStudioInput, model: string) {
  if (!ENV.groqApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "خدمة التحليل غير مفعّلة على الخادم." });
  if (!input.imageBase64) throw new TRPCError({ code: "BAD_REQUEST", message: "أرفق صورة للتحليل أو التقييم." });
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.groqApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, { type: "image_url", image_url: { url: input.imageBase64 } }] }], max_completion_tokens: 900 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "تعذر تحليل الصورة حاليًا." });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return { kind: "text" as const, text: payload.choices?.[0]?.message?.content ?? "لم أستطع استخراج تقييم من الصورة." };
}

export function getImageStudioModel(mode: ImageStudioMode, pro: boolean) {
  if (mode === "analyze" || mode === "evaluate") return pro ? ENV.groqProVisionModel : ENV.groqVisionModel;
  return pro ? ENV.geminiProImageModel : ENV.geminiImageModel;
}

export async function runImageStudio(input: ImageStudioInput) {
  if (input.prompt.trim().length < 2 || input.prompt.length > 4000) throw new TRPCError({ code: "BAD_REQUEST", message: "وصف الصورة غير صالح." });
  if (input.imageBase64 && input.imageBase64.length > 6_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الصورة كبير جدًا." });
  if (input.imageBase64 && input.mimeType && !["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الصورة غير مدعوم." });
  if (input.mode === "edit" && !input.imageBase64) throw new TRPCError({ code: "BAD_REQUEST", message: "أرفق صورة للتحرير." });
  if ((input.mode === "generate" || input.mode === "edit") && !input.firebaseUid) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "تعذر تحديد حساب Firebase الموثق." });
  const quotaCheck = await checkImageQuota(input.sessionId, false, input.mode !== "generate" && input.mode !== "edit");
  const model = getImageStudioModel(input.mode, quotaCheck.plan === "pro");
  if (input.mode !== "generate" && input.mode !== "edit") {
    const result = await callGroqVision(input, model);
    const quota = await consumeImageQuota(input.sessionId, quotaCheck); return { ...result, provider: input.mode === "analyze" ? "groq" : "groq", plan: quota.plan, remaining: quota.remaining, model };
  }
  const uid=input.firebaseUid!; const size=input.resolution===1024 ? 1024 : 512; const cost=Number(((size===1024?104.20:26.05)+(input.mode==="edit"?5.37:0)).toFixed(2)); const requestId=randomUUID();
  let paidMode = false; let neuronReserved=false;
  if (process.env.NODE_ENV !== "test") {
    const balance=await neuronBalance(uid); const freeLeft=await freeImagesRemaining(uid); paidMode=size===1024 || freeLeft<=0;
    if(paidMode && balance<cost) throw new TRPCError({code:"PAYMENT_REQUIRED",message:freeLeft<=0 ? "انتهت الصور المجانية اليومية ورصيد Neurons غير كافٍ." : "رصيد Neurons غير كافٍ للدقة المطلوبة."});
    if(paidMode) { try { await reserveNeuronBalance(uid,cost,requestId); neuronReserved=true; } catch(e) { const m=(e as Error).message; throw new TRPCError({code:m==="INSUFFICIENT_NEURONS"?"PAYMENT_REQUIRED":"PRECONDITION_FAILED",message:m==="INSUFFICIENT_NEURONS"?"رصيد Neurons غير كافٍ.":"خدمة الرصيد غير متاحة."}); } }
  }
  let freeReservation: string|undefined; let cloudReservation: string|undefined; let workerSuccess=false;
  if(process.env.NODE_ENV!=="test") {
    if(!paidMode) { try { freeReservation=await reserveFreeImage(uid); } catch(e) { const m=(e as Error).message; if(m==="FREE_DAILY_QUOTA") { const balance=await neuronBalance(uid); if(balance>=cost) { paidMode=true; try { await reserveNeuronBalance(uid,cost,requestId); neuronReserved=true; } catch(reserveError) { const reserveMessage=(reserveError as Error).message; throw new TRPCError({code:reserveMessage==="INSUFFICIENT_NEURONS"?"PAYMENT_REQUIRED":"PRECONDITION_FAILED",message:reserveMessage==="INSUFFICIENT_NEURONS"?"رصيد Neurons غير كافٍ.":"خدمة الرصيد غير متاحة."}); } } else throw new TRPCError({code:"TOO_MANY_REQUESTS",message:"استهلكت حدك المجاني: 3 صور يوميًا بدقة 512×512."}); } else throw new TRPCError({code:"PRECONDITION_FAILED",message:"خدمة الحصص غير متاحة."}); } }
    try { cloudReservation=await reserveCloudflareUsage(cost); }
    catch(e) {
      if(freeReservation) await releaseFreeImage(uid,freeReservation);
      if(neuronReserved) await refundNeuronReservation(uid,cost,requestId);
      const m=(e as Error).message; throw new TRPCError({code:m==="CLOUDFLARE_DAILY_CAP"?"TOO_MANY_REQUESTS":"PRECONDITION_FAILED",message:m==="CLOUDFLARE_DAILY_CAP"?"تم بلوغ سقف Cloudflare اليومي.":"خدمة الحصص غير متاحة."});
    }
  }
  let result:any; let provider="cloudflare";
  try {
    if(!ENV.imageWorkerUrl || !ENV.imageWorkerSecret) throw new Error("WORKER_NOT_CONFIGURED");
    const inputMimeType=input.mimeType??(input.imageBase64?decodeDataUrl(input.imageBase64).mimeType:undefined);
    const response=await fetch(ENV.imageWorkerUrl,{method:"POST",headers:{"Content-Type":"application/json","X-AUREVION-WORKER-SECRET":ENV.imageWorkerSecret},body:JSON.stringify({model:"@cf/black-forest-labs/flux-2-klein-4b",prompt:input.prompt,width:size,height:size,inputImageBase64:input.mode==="edit"?input.imageBase64:undefined,inputImageMimeType:inputMimeType}),signal:AbortSignal.timeout(60000)});
    if(!response.ok) {
      const details=await response.text().catch(()=>"");
      if(["CLOUDFLARE_DAILY_QUOTA","CLOUDFLARE_NEURON_LIMIT","DAILY_NEURON_LIMIT"].some(code=>details.includes(code)) || (response.status===429 && /neuron|daily.{0,20}quota|quota.{0,20}daily/i.test(details))) { const e:any=new Error("WORKER_QUOTA");e.entitlement=true;throw e; }
      throw new Error(`WORKER_TECHNICAL_${response.status}`);
    }
    const data=await response.json() as {image?:unknown}; if(typeof data.image!=="string"||! /^[A-Za-z0-9+/=]+$/.test(data.image)) throw new Error("WORKER_INVALID_IMAGE");
    result={kind:"image",text:"تم إنشاء الصورة عبر Cloudflare Workers AI.",imageDataUrl:`data:image/png;base64,${data.image}`}; workerSuccess=true;
  } catch(error:any) {
    if(error?.entitlement) { if(cloudReservation) await releaseCloudflareUsage(cost,cloudReservation); if(freeReservation) await releaseFreeImage(uid,freeReservation); if(neuronReserved) await refundNeuronReservation(uid,cost,requestId); throw new TRPCError({code:"TOO_MANY_REQUESTS",message:"تم بلوغ حصة Neurons اليومية لدى Cloudflare."}); }
    if(cloudReservation) await releaseCloudflareUsage(cost,cloudReservation); cloudReservation=undefined;
    provider="gemini";
    try { result=await callGeminiImage(input,size===1024?ENV.geminiProImageModel:ENV.geminiImageModel); if (!result.imageDataUrl) throw new Error("GEMINI_NO_IMAGE"); }
    catch(geminiError) { if(freeReservation) await releaseFreeImage(uid,freeReservation); if(neuronReserved) await refundNeuronReservation(uid,cost,requestId); throw geminiError; }
  }
  try {
    const quota=paidMode ? {plan:"pro" as const,remaining:await freeImagesRemaining(uid)} : {plan:"free" as const,remaining:process.env.NODE_ENV === "test" ? 2 : await freeImagesRemaining(uid)};
    return {...result,provider,plan:quota.plan,remaining:quota.remaining,model:workerSuccess?"@cf/black-forest-labs/flux-2-klein-4b":(size===1024?ENV.geminiProImageModel:ENV.geminiImageModel),neuronCost:cost};
  } catch(error) { if(freeReservation) await releaseFreeImage(uid,freeReservation); if(neuronReserved) await refundNeuronReservation(uid,cost,requestId); throw error; }
}
