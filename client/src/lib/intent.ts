const imageNouns = /(?:صورة|صور|تصوير|رسم(?:ة)?|رسمة|لوحة|مشهد|خلفية|شعار|لوجو|بوستر|ملصق|تصميم بصري|image|images|picture|pictures|photo|photograph|drawing|illustration|artwork|art|logo|poster|wallpaper|visual|render|imagen|imágenes|foto|fotografía|dessin|image|bild|bilder|изображен|картин|bild|afbeelding|imagem|写真|画像|그림|이미지|ภาพ|รูปภาพ)/i;
const creationVerbs = /(?:أنشئ|انشئ|إنشاء|انشاء|اصنع|صنع|اعمل|أعمل|سوي|سويلي|سوّي|سوّلي|سوه|ارسم|أرسم|رسم|صمم|أصمم|تصميم|ولّد|ولد|توليد|ابتكر|ابتكار|حضّر|جهّز|نفّذ|اعمللي|اعمل لي|اريد|أريد|ارغب|ابغى|خلّي|خلي|make|create|generate|draw|design|illustrate|render|produce|paint|visualize|genera|crear|haz|dibuja|diseña|crée|créer|dessine|conçois|erzeuge|erstelle|zeichne|создай|сгенерируй|нарисуй|сделай|gere|crie|faça|desenhe|作って|生成して|描いて|만들어|생성해|그려|สร้าง|สร้างภาพ)/i;
const nonGeneration = /(?:حلل|تحليل|قيّم|تقييم|عدّل|تعديل|حرر|تحرير|غيّر|تغيير|اقرأ|اشرح الصورة|analy[sz]e|edit|modify|evaluate|review|describe|enhance|upscale)/i;

export function isImageGenerationRequest(input: string) {
  const text = input.trim();
  if (!text || nonGeneration.test(text)) return false;
  if (!imageNouns.test(text)) return false;
  return creationVerbs.test(text) || /(?:اريد|أريد|i want|i need|please|من فضلك|لو سمحت|can you|could you)/i.test(text);
}
