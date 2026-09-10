export type ServerImageMode = "generate" | "edit" | "analyze";

const imageNouns = /(?:صورة|صور|رسم|رسمة|لوحة|مشهد|خلفية|شعار|لوجو|بوستر|ملصق|image|images|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|visual|render|imagen|foto|dessin|bild|bilder|изображен|картин|afbeelding|imagem|画像|그림|이미지|รูปภาพ)/i;
const createWords = /(?:أنشئ|انشئ|إنشاء|انشاء|اصنع|صنع|اعمل|أعمل|سوي|سويلي|سوّي|سوّلي|ارسم|أرسم|صمم|أصمم|تصميم|ولّد|ولد|توليد|ابتكر|حضّر|جهّز|نفّذ|make|create|generate|draw|design|illustrate|render|produce|paint|visualize|crear|haz|dibuja|diseña|crée|créer|dessine|erzeuge|erstelle|zeichne|создай|сгенерируй|нарисуй|сделай|crie|faça|desenhe|作って|生成して|描いて|만들어|생성해|그려|สร้างภาพ)/i;
const editWords = /(?:عدّل|تعديل|حرر|تحرير|غيّر|تغيير|حسّن|تحسين|edit|modify|retouch|enhance|upscale)/i;
const analyzeWords = /(?:حلل|تحليل|قيّم|تقييم|اشرح الصورة|صف الصورة|analy[sz]e|evaluate|review|describe|what is in)/i;

export function resolveServerImageIntent(prompt: string, hasImage = false): ServerImageMode | null {
  const text = prompt.trim();
  if (!text || !imageNouns.test(text)) return null;
  if (editWords.test(text)) return hasImage ? "edit" : null;
  if (analyzeWords.test(text)) return hasImage ? "analyze" : null;
  return createWords.test(text) || /(?:أريد|اريد|i want|i need|please|من فضلك|لو سمحت)/i.test(text) ? "generate" : null;
}
