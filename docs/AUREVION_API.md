# AUREVION secure brain API

هذا الخادم هو الوسيط الآمن بين بوابة AUREVION أو تطبيق Android وعقل Groq. لا يرسل العميل مفتاح Groq مطلقًا؛ المفتاح موجود في متغير خادم سري باسم `GROQ_API_KEY`.

## الهوية

أوريفون هو عقل روبوتي مفتوح المصدر مبني على نماذج Groq ومصمم ليكون العقل الذكي لهاتف AUREVION الروبوتي. المطور الظاهر في البوابة ولوحة المالك هو «حارث عبدالله الجبوري».

## REST endpoint

`POST /api/aurevion/chat`

يرسل العميل JSON بهذه الصيغة:

```json
{
  "sessionId": "device-or-session-id",
  "messages": [
    { "role": "user", "content": "من أنت؟" }
  ],
  "webSearch": false
}
```

قواعد العميل هي أن يكون `sessionId` معرّفًا عشوائيًا لا يحتوي بيانات شخصية، وأن يرسل آخر 12 رسالة فقط. يسمح الخادم بحد أقصى 8,000 حرف لكل رسالة، ويطبّق حصة يومية ومهلة قصيرة بين الطلبات.

يرجع الخادم:

```json
{
  "reply": "أنا أوريفون...",
  "model": "openai/gpt-oss-20b",
  "searched": false,
  "plan": "free",
  "remaining": 24
}
```

ضع `webSearch: true` عندما يطلب المستخدم معلومة حديثة. يستخدم الخادم `groq/compound-mini` عند توفره، ويرجع للنموذج الأساسي إذا لم تتوفر أداة البحث.

## اختبار محلي

```bash
curl -X POST http://localhost:3000/api/aurevion/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"android-test-001","messages":[{"role":"user","content":"من أنت؟"}],"webSearch":false}'
```

## إعدادات الخادم

```text
GROQ_API_KEY                  سر الخادم فقط
GROQ_MODEL                    النموذج النصي الأساسي
AUREVION_OFFICIAL_SITE_URL    رابط البوابة الرسمية
AUREVION_ALLOWED_ORIGINS      قائمة Origins مفصولة بفواصل
AUREVION_FREE_MESSAGE_LIMIT   الحد المجاني اليومي
AUREVION_PRO_MESSAGE_LIMIT    الحد الاحترافي اليومي
```

في الإنتاج، يسمح الخادم بالطلبات ذات Origin الموجود في `AUREVION_ALLOWED_ORIGINS` فقط. طلبات تطبيق Android الأصلية لا ترسل عادةً Origin، لذلك تستخدم المصادقة الخاصة بالتطبيق في طبقة Android عند اعتمادها مع المصنع؛ لا تعتبر CORS بديلًا عن المصادقة.

## Android

يستخدم تطبيق Android عميل HTTPS إلى عنوان الخادم. لا يضمّن التطبيق `GROQ_API_KEY` أو `harth.txt` أو نسخة سرية من تعليمات النظام. يمكن للتطبيق إنشاء `sessionId` عشوائيًا وحفظه في التخزين المحلي الآمن، ثم إرسال الرسائل إلى endpoint أعلاه.

## الخطط

الخطة المجانية افتراضيًا 25 رسالة يوميًا لكل جلسة، والخطة الاحترافية 500 رسالة يوميًا. الشاشة الحالية تعرض الخطط والحصص، لكن تحصيل المدفوعات يحتاج مزود دفع مؤهلًا ومفاتيح منفصلة. فواتير Groq خدمة مستقلة عن مدفوعات مستخدمي AUREVION.

## أسرار ممنوعة

لا ترفع `harth.txt` أو أي ملف يحتوي مفتاح Groq إلى Git أو GitHub أو الموقع أو APK. استخدم Secrets في بيئة الخادم، وألغِ أي مفتاح ظهر في محادثة أو سجل أو مستودع.
