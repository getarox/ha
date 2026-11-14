export async function prepareImageForWorker(file: File, maxEdge = 511): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("الملف ليس صورة مدعومة.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز الصورة المرجعية.");
    context.drawImage(bitmap, 0, 0, width, height);
    const outputType = file.type === "image/jpeg" || file.type === "image/webp" ? file.type : "image/png";
    return canvas.toDataURL(outputType, outputType === "image/png" ? undefined : 0.9);
  } finally {
    bitmap.close();
  }
}
