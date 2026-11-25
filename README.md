# Role Bot — بوت إعطاء وإزالة الرتب

أمر واحد: `/role` (action: إعطاء/إزالة، user، role)

## الحماية
- يتطلب صلاحية Manage Roles (أو رتب محددة في ALLOWED_ROLE_IDS)
- كولداون 60 ثانية لكل شخص (COOLDOWN_SECONDS)
- منع تشغيل الأمر مرتين بنفس اللحظة لنفس الشخص
- ما يعطي رتب أعلى من رتبة المستخدم أو البوت
- رتب الأدمن ورتب البوتات والـ @everyone محمية
- ردود مخفية (ephemeral) وتسجيل السبب في Audit Log

## الإعداد
1. discord.com/developers/applications ← New Application ← Bot ← Reset Token (انسخ التوكن).
2. OAuth2 ← URL Generator ← scopes: `bot` و `applications.commands` ← صلاحية: Manage Roles ← افتح الرابط وضيف البوت.
3. في السيرفر: ارفع رتبة البوت فوق الرتب اللي بيعطيها.
4. Developer Mode ← كليك يمين على السيرفر ← Copy Server ID (GUILD_ID). CLIENT_ID من صفحة التطبيق.
5. الاستضافة: ارفع الملفات، Build: `npm install`، Start: `node index.js`، وحط المتغيرات (TOKEN, CLIENT_ID, GUILD_ID) في Environment Variables. لا ترفع ملف .env.

تشغيل محلي للتجربة: `npm install` ثم `node index.js`
