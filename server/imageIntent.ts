export type ServerImageMode = "generate" | "edit" | "analyze";

const imageNouns = /(?:صورة|صور|رسم|رسمة|لوحة|مشهد|خلفية|شعار|لوجو|بوستر|ملصق|image|images|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|visual|render|imagen|foto|dessin|bild|bilder|изображен|картин|afbeelding|imagem|画像|그림|이미지|รูปภาพ)/i;
const createWords = /(?:أنشئ|انشئ|إنشاء|انشاء|اصنع|صنع|اعمل|أعمل|سوي|سويلي|سوّي|سوّلي|ارسم|أرسم|صمم|أصمم|تصميم|ولّد|ولد|توليد|ابتكر|حضّر|جهّز|نفّذ|make|create|generate|draw|design|illustrate|render|produce|paint|visualize|crear|haz|dibuja|diseña|crée|créer|dessine|erzeuge|erstelle|zeichne|создай|сгенерируй|нарисуй|сделай|crie|faça|desenhe|作って|生成して|描いて|만들어|생성해|그려|สร้างภาพ)/i;
const editWords = /(?:عدّل|تعديل|حرر|تحرير|غيّر|تغيير|حسّن|تحسين|edit|modify|retouch|enhance|upscale)/i;
const analyzeWords = /(?:حلل|تحليل|قيّم|تقييم|اشرح الصورة|صف الصورة|analy[sz]e|evaluate|review|describe|what is in)/i;
const searchWords = /(?:ابحث|بحث|دور|دوّر|فتّش|جوجل|google|search|find|look up|show me existing|browse|найди|buscar|recherche)/i;
const requestWords = /(?:أريد|اريد|أحتاج|احتاج|ممكن|لو سمحت|من فضلك|اعطني|أعطني|جيب|جلب|وريني|أرني|خلّي|خلي|ابغى|ارغب|i want|i need|can you|please|give me|show me|find me|make me|could you)/i;
const implicitCreateRequest = /^(?:صورة|صور|رسم|رسمة|لوحة|مشهد|خلفية|شعار|لوجو|بوستر|ملصق|image|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|visual|render)\s+(?:ل|عن|في|ب|من|على|مع|of|for|about|in|with)\b/i;

export function resolveServerImageIntent(prompt: string, hasImage = false): ServerImageMode | null {
  const text = prompt.trim();
  if (!text || !imageNouns.test(text)) return null;
  if (editWords.test(text)) return hasImage ? "edit" : null;
  if (analyzeWords.test(text)) return hasImage ? "analyze" : null;
  if (searchWords.test(text)) return null;
  if (createWords.test(text) || requestWords.test(text)) return "generate";
  if (implicitCreateRequest.test(text) && !/[؟?]/.test(text)) return "generate";
  return null;
}
