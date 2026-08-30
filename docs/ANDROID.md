# Android handoff

التطبيق الأصلي مكتوب بـ Kotlin وJetpack Compose ويستخدم الحزمة `com.aurevion.app`. يتم إنشاء `sessionId` محليًا في التطبيق، ويُرسل إلى endpoint المحادثة عبر اتصال HTTPS. لا يحتوي المشروع على مفاتيح Groq أو Gemini.

## البناء

افتح `android/` في Android Studio، ثبّت Android SDK 35، ثم نفّذ Gradle Sync وابنِ `app` عبر `assembleDebug`. قبل اختبار جهاز حقيقي، تحقّق من أن عنوان API المنشور يطابق العقد الموجود في `docs/AUREVION_API.md`.

## قبل الإنتاج

استبدل عنوان الخادم الثابت بتهيئة build flavors أو `BuildConfig`، أضف تخزينًا آمنًا دائمًا لمعرّف الجلسة، وفعّل certificate pinning فقط بعد امتلاك دورة تدوير شهادات واضحة. لا تضع أسرار المزود أو تعليمات النظام داخل APK.
