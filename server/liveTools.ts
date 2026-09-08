type LiveResult = { tool: string; text: string };

async function json(url: string) { const response = await fetch(url, { signal: AbortSignal.timeout(4_000) }); if (!response.ok) throw new Error(`live API ${response.status}`); return response.json(); }

export async function getWeather(location: string): Promise<LiveResult> {
  const name = location.trim().replace(/[؟?!.،,].*$/, "").slice(0, 80) || "Baghdad";
  const geo = await json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ar&format=json`);
  const isKhanukaFallback = !geo.results?.[0] && /خانو?غة|خانو?كة|الخانو?غة|الخانو?كة/i.test(name);
  const place = geo.results?.[0] ?? (isKhanukaFallback ? { name: "الخانوكة قرب الشرقاط", country: "العراق", latitude: 35.62, longitude: 43.20 } : undefined);
  if (!place) throw new Error("لم أجد المدينة المطلوبة للطقس.");
  const weather = await json(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
  const current = weather.current;
  return { tool: "weather", text: `بيانات الطقس اللحظية لمنطقة ${place.name}، ${place.country}${isKhanukaFallback ? " (إحداثيات تقريبية؛ الدقة الأدق تحتاج مشاركة إحداثيات القرية من الهاتف)" : ""}: الحرارة ${current.temperature_2m}°${current_units(weather).temperature_2m}، المحسوسة ${current.apparent_temperature}°، الرطوبة ${current.relative_humidity_2m}%، سرعة الرياح ${current.wind_speed_10m} كم/س. وقت القياس: ${current.time}. المصدر: Open-Meteo.` };
}
function current_units(weather: any) { return weather.current_units ?? { temperature_2m: "C" }; }

export async function getExchange(from: string, to: string): Promise<LiveResult> {
  const base = (from.match(/[A-Za-z]{3}/)?.[0] || "USD").toUpperCase();
  const quote = (to.match(/[A-Za-z]{3}/)?.[0] || "IQD").toUpperCase();
  const data = await json(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`);
  const rate = data.rates?.[quote];
  if (!rate) throw new Error("لم أجد سعر الصرف المطلوب.");
  return { tool: "exchange", text: `سعر الصرف الحالي المتاح: 1 ${base} = ${rate} ${quote}. التاريخ: ${data.date}. المصدر: Frankfurter/ECB.` };
}

export async function getLiveContext(message: string): Promise<LiveResult | null> {
  const lower = message.toLowerCase();
  if (/(طقس|الجو|حرارة|درجة الحرارة|weather|temperature)/i.test(lower)) {
    const location = message.replace(/.*?(طقس|الجو|حرارة|درجة الحرارة|weather|temperature)/i, "").replace(/^\s*(?:في|بـ|بمدينة|بمدينه|ب)\s+/i, "").replace(/[؟?!،,.]+$/, "").trim() || "بغداد";
    return getWeather(location);
  }
  if (/(سعر الصرف|صرف|دولار|دينار|يورو|exchange|currency)/i.test(lower)) {
    return getExchange(message.includes("يورو") ? "EUR" : "USD", message.includes("دينار") ? "IQD" : message.includes("يورو") ? "EUR" : "IQD");
  }
  return null;
}
