[README.md](https://github.com/user-attachments/files/31964148/README.md)
# T.M.D AI — Religious Edition

نسخة متخصصة للأسئلة الدينية فقط. عند السؤال: يبحث النظام في إسلام ويب، ويبحث في قناة YouTube المحددة فقط عبر YouTube Data API، ثم يمرر النتائج إلى محرك الإجابة.

## المصادر الثابتة
- Islamweb: https://islamweb.net/ar/
- YouTube channel ID: UCv0g_v1C6JcZALvrkDu98AQ

## متغيرات Vercel
- GROQ_API_KEY
- GROQ_MODEL (اختياري)
- YOUTUBE_API_KEY
- YOUTUBE_CHANNEL_ID=UCv0g_v1C6JcZALvrkDu98AQ
- ISLAMWEB_BASE_URL=https://islamweb.net/ar/fatwa/
- OWNER_SECRET
- BLOB_READ_WRITE_TOKEN (اختياري للإعدادات)

## ملاحظة YouTube
لا يوجد بحث عام في YouTube. طلب البحث يرسل `channelId` مع `type=video`، لذلك النتائج مقيدة بالقناة المحددة. وفق توثيق YouTube Data API، معامل `channelId` يقيد النتائج بالفيديوهات التي أنشأتها القناة.

## ملاحظة دينية
الأداة ليست جهة إفتاء رسمية. عند عدم كفاية المصدر أو كون المسألة شخصية/حساسة، يجب الرجوع إلى مفتٍ مؤهل.
