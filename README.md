# AUREVION Secure Brain

هذه الحزمة هي نسخة تجهيز لمستودع AUREVION، وليست تطبيقًا جديدًا منفصلًا. تم تنظيم الشيفرة المرفقة في بنية React/Vite وNode/Express/tRPC، مع مجلد Android أصلي باسم الحزمة `com.aurevion.app`.

## ما تم تضمينه

توجد واجهة البوابة في `client/` وتشمل المحادثة واستوديو الصور ولوحة المالك. توجد وحدات الخادم والراوترات في `server/`، والمخطط والترحيلات في `drizzle/`. يوجد تطبيق Android في `android/` ويستهلك واجهة HTTPS دون أي مفتاح مزود.

## التشغيل المحلي

انسخ `.env.example` إلى `.env`، وأدخل الأسرار في بيئة الخادم فقط، ثم ثبّت الاعتماديات عبر `pnpm install`. شغّل `pnpm check` و`pnpm test` ثم `pnpm build`. لا ترفع `.env` أو `harth.txt` أو أي مفاتيح إلى GitHub.

## Android

افتح مجلد `android/` في Android Studio، ثم نفّذ Gradle Sync وشغّل مهمة `assembleDebug`. عدّل عنوان الخادم في `android/app/src/main/java/com/aurevion/app/AurevionApi.kt` عند تغيير بيئة النشر، مع الإبقاء على HTTPS وعدم إضافة أسرار المزود إلى التطبيق.

## الأمان

الخادم هو المكان الوحيد المسموح له بقراءة `GROQ_API_KEY` و`GEMINI_API_KEY`. التحقق من العميل، عزل الجلسات، حدود المعدل والحصص تُنفّذ في الخادم. يجب تفعيل مصادقة مناسبة للإنتاج ومراجعة CORS والنطاقات قبل النشر العام.

## GitHub

بعد فك الضغط، أنشئ مستودعًا فارغًا، ثم نفّذ `git init` و`git add .` و`git commit -m "Prepare AUREVION web and Android workspace"` وبعدها أضف remote المستودع وادفع الفرع الرئيسي. سيرفض فحص CI الملفات السرية ويشغّل TypeScript والاختبارات والبناء.

راجع `docs/AUREVION_API.md` و`docs/ANDROID.md` للتفاصيل.
