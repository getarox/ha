# ربط Worker الصور لـAUREVION

هذا الـWorker يوفّر endpoint وسيطًا محميًا بسر مشترك، ويستدعي `@cf/black-forest-labs/flux-2-klein-4b` عبر Workers AI binding. عقد Vercel → Worker هو JSON (`model`, `prompt`, `width`, `height`) مع ترويسة `X-AUREVION-WORKER-SECRET`؛ والـWorker يحوّل الطلب داخليًا إلى `multipart/form-data` المطلوبة رسميًا بواسطة نموذج Cloudflare، حتى في التوليد النصي. وضع التحرير يضيف `inputImageBase64` و`inputImageMimeType`.

## النشر من Termux

بعد تطبيق patch على نسخة المستودع:

```bash
cd ~/ha/workers/image-worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put AUREVION_WORKER_SECRET
```

أدخل قيمة سر قوية في مطالبة Wrangler. **استخدم القيمة نفسها تمامًا** في متغير Vercel `AUREVION_IMAGE_WORKER_SECRET`، لكن لا تضفها إلى Git أو ترسلها في المحادثة. خزّن الرابط الذي يظهر بعد النشر، عادةً على نطاق `workers.dev`.

## إعداد Vercel

من لوحة المشروع في Vercel → **Settings → Environment Variables**، حدّث بيئة Production (وأي بيئة Preview تستخدمها) بهذه القيم:

- `AUREVION_IMAGE_WORKER_URL`: رابط Worker المنشور كاملًا.
- `AUREVION_IMAGE_WORKER_SECRET`: السر نفسه الذي أدخلته لـ`AUREVION_WORKER_SECRET` في Wrangler.

أعد نشر الموقع بعد تغيير متغيرات البيئة. لا يلزم وضع Cloudflare API token في Vercel؛ صلاحية Workers AI مربوطة في `wrangler.jsonc` باسم `AI`.

## فحوصات محلية قبل الدمج

من جذر المستودع:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

تستخدم واجهة Worker صورة مرجعية واحدة حاليًا؛ تصغير المتصفح لها إلى 511×511 أو أقل قبل الإرسال، وفق شرط مدخلات FLUX.2 Klein. التوليد 512×512 يُحاسب 26.05 Neurons، و1024×1024 يُحاسب 104.20؛ صورة مرجعية واحدة تضيف 5.37 Neurons (أي 31.42 و109.57 للتحرير على الترتيب). سقف التطبيق اليومي مضبوط على 10,000 Neurons؛ لذلك 330 صورة/يوم تقدير تقريبي، وليس العدد الحسابي الثابت: نظريًا نحو 383 توليدًا نصيًا 512×512 أو نحو 318 عملية تحرير 512×512، قبل اختلاف فشل المزود/الاستعمالات الأخرى.

حصة المستخدم المجانية هي 3 مخرجات 512×512 يوميًا لكل Firebase UID، ويُخزّن تاريخ اليوم بتوقيت UTC. Gemini لا يعمل عند نفاد نقاط المستخدم أو حصة Cloudflare/سقف التطبيق؛ ويُستدعى فقط عند فشل تقني من Worker.

الدفع للباقات مقوم بالدولار USD مع PayTabs. يجب أن يكون ملف PayTabs يقبل USD؛ إذا لم يكن USD مفعّلًا، سيرفض الخادم إنشاء طلب الدفع ولن يمنح نقاطًا. لا تُرسل مفاتيح PayTabs أو Firebase أو Cloudflare في Git أو في محادثة الدعم.
