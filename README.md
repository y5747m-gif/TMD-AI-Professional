# T.M.D AI Professional — النسخة الجديدة

هذه النسخة تعمل على:

- Vercel
- Groq API
- Vercel Blob
- JavaScript / HTML / CSS فقط في الواجهة

## المتطلبات

أضف في Vercel Environment Variables:

1. `GROQ_API_KEY`
2. `GROQ_MODEL`
3. `GROQ_VISION_MODEL`
4. `OWNER_SECRET`
5. `BLOB_READ_WRITE_TOKEN`

القيم المقترحة:

```text
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=qwen/qwen3.6-27b
```

## Vercel Blob

من مشروع Vercel افتح Storage ثم أنشئ Blob Store، واربطه بالمشروع حتى تتم إضافة `BLOB_READ_WRITE_TOKEN` إلى البيئة.

يستخدم المشروع Blob لحفظ:

- إعدادات الموقع
- شعار الموقع
- خلفية الموقع

## تسجيل المالك

المستخدم العادي لا يحتاج تسجيل دخول.

المالك يضغط:

`⚙️ لوحة المالك`

ثم يدخل قيمة `OWNER_SECRET`.

لا تضع `OWNER_SECRET` داخل ملفات JavaScript.

## الصور

زر `+` بجوار خانة الكتابة يتيح:

- تحليل صورة
- اقتراح تعديلات على صورة

التحليل يتم بواسطة نموذج Groq متعدد الوسائط.

هذه النسخة لا تدّعي أنها تعدّل ملف الصورة فعليًا؛ وضع "اقتراح تعديلات" يعطي تعليمات دقيقة للتعديل. تنفيذ تعديل/توليد الصورة نفسها يحتاج خدمة صور إضافية.

## ملاحظة عن المجانية

Vercel Blob له حدود استخدام في خطة Hobby، وGroq له حدود/أسعار بحسب الحساب والنموذج. لذلك لا يوجد ضمان لاستخدام غير محدود مجانًا. هذه البنية لا تحتاج OpenAI API.
