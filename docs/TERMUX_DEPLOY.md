# نشر AUREVION على Termux

هذا الدليل مخصص لنشر نسخة الخادم من مستودع GitHub على Termux. لا تضع أي مفتاح مزود داخل Git أو داخل تطبيق العميل.

## 1. تجهيز Termux

```bash
pkg update -y
pkg upgrade -y
pkg install -y git nodejs-lts
npm install -g pnpm
```

## 2. جلب المشروع وبناؤه

```bash
git clone https://github.com/getarox/ha.git
cd ha
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

## 3. إعداد متغيرات الخادم

أنشئ ملف `.env` محلياً فقط:

```bash
cp .env.example .env
nano .env
```

يجب ضبط `GROQ_API_KEY` للدردشة، و`GEMINI_API_KEY` للصور الاحتياطية، و`DATABASE_URL` إذا كانت المحفظة والجلسات الدائمة مطلوبة. لا تُرسل هذه القيم إلى المتصفح ولا ترفع الملف إلى GitHub.

للاختبار المحلي السريع، يمكن تشغيل الخادم بدون قاعدة بيانات؛ عندها تستخدم الجلسات والمحفظة ذاكرة العملية وتعود البيانات إلى الصفر عند إعادة التشغيل.

## 4. التشغيل

```bash
NODE_ENV=production pnpm start
```

يعمل الخادم افتراضياً على المنفذ `3000`. لتغيير المنفذ:

```bash
PORT=3000 NODE_ENV=production pnpm start
```

لإبقائه عاملاً في جلسة Termux، استخدم `tmux` أو خدمة تشغيل مناسبة، ولا تعتمد على إغلاق التطبيق في الخلفية.

## 5. اختبارات القبول

من جهاز آخر أو من Termux نفسه:

```bash
BASE="http://127.0.0.1:3000"
curl -i "$BASE/api/health"
curl -i "$BASE/api/aurevion/health"
curl -i "$BASE/api/wallet?sessionId=termux-acceptance-12345"
curl -i -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  --data '{"sessionId":"termux-acceptance-12345","messages":[{"role":"user","content":"من أنت؟"}],"webSearch":false}'
```

يجب أن يعيد `/api/health` و`/api/aurevion/health` JSON بحالة `200`. يجب أن يعيد `/api/wallet` JSON واضحاً؛ عند غياب قاعدة البيانات تكون الحالة `503` برسالة `DATABASE_UNAVAILABLE`، وليس خطأً غامضاً أو انهياراً.

## 6. اختبار البحث والصور

اختبر البحث بسؤال صريح عن معلومة حديثة. إذا لم تتوفر خدمة بحث أو مصدر قابل للتحقق، يجب أن يصرّح النظام بعدم القدرة على التأكيد وألا يخترع نتيجة.

```bash
curl -i -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  --data '{"sessionId":"termux-search-12345","messages":[{"role":"user","content":"ما آخر الأخبار التقنية اليوم؟"}],"webSearch":true}'
```

لا تنفذ طلبات PayTabs حقيقية أثناء الاختبار. اختبر فقط طرق HTTP والتحقق من البيانات والتوقيع، ولا تضغط زر شراء ببيانات إنتاجية.

## 7. تشغيل آمن

استخدم HTTPS أمام الخادم عند نشره على الإنترنت، واضبط `AUREVION_ALLOWED_ORIGINS` على النطاقات المطلوبة فقط. لا تفتح قاعدة البيانات مباشرة للإنترنت. راقب السجلات بحثاً عن أخطاء مزودي الذكاء الاصطناعي، ولا تطبع محتوى الأسرار أو قيمها.

## 8. نشر التعديل على Vercel من Termux

الموقع الإنتاجي الوحيد هو `https://aurevion-project.vercel.app`. أما `https://aurevion-two.vercel.app` فهو موقع عرض فقط ولا يُستخدم لـ OAuth أو End Users أو callbacks أو بيانات الإنتاج.

بعد ضبط أسرار الإنتاج في مشروع Vercel، نفّذ الأمر التالي من داخل نسخة المستودع في Termux:

```bash
cd ~/ha && git pull --ff-only origin main && pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm build && npx vercel --prod --yes
```

ثم تحقّق من الإصدار الإنتاجي:

```bash
curl -sS https://aurevion-project.vercel.app/api/health
curl -sS "https://aurevion-project.vercel.app/api/consent/status?sessionId=termux-acceptance-12345"
```

يجب ضبط `AUREVION_OFFICIAL_SITE_URL=https://aurevion-project.vercel.app` و`AUREVION_ALLOWED_ORIGINS=https://aurevion-project.vercel.app` في أسرار الإنتاج. لا تضع مفاتيح OAuth أو Groq أو PayTabs داخل التطبيق أو GitHub.
