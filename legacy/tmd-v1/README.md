# النسخة القديمة T.M.D AI (v1) — للرجوع والمراجعة فقط

هذه الملفات هي **النموذج الأولي القديم** للمشروع، وقد استُبدلت بالكامل بأداة «مشكاة»
الموجودة في `mishkat/` + `api/mishkat.js`.

## لماذا نُقلت هنا؟

* كانت تعتمد على **بيانات وهمية (mock)** في كل مسارات البحث الشرعي (`sharia-search.js`,
  `islamweb-search.js`) ولا تتصل بالقناة فعليًا.
* كانت تخلط بين نظامَي الوحدات ESM و CommonJS داخل الملفات نفسها (`export default`
  مع `require`) وهو ما يسبب أخطاء تشغيل على Vercel.
* وجودها في المسار الجذر/`api` كان يربك النشر ويُظهر واجهة قديمة.

## ماذا استُخدم بدلًا منها؟

| القديم | الجديد في «مشكاة» |
| --- | --- |
| `api/sharia-search.js` (mock) | `mishkat/lib/retrieve.js` (بحث FTS5 حقيقي في نصوص القناة) |
| `api/islamweb-search.js` (mock) | `mishkat/lib/ingest.js` + `mishkat/lib/youtube.js` (سحب نصوص القناة فعليًا) |
| `api/chat.js` (Gemini فقط + ESM/CJS مختلط) | `mishkat/lib/ai.js` (مزوّدون متعددون + بثّ SSE + محرك استخراجي) |
| `index.html` / `app.js` / `style.css` الجذرية | `mishkat/public/*` (واجهة «مشكاة» الاحترافية) |
| `api/settings.js` + `owner-login.js` | لوحة إدارة مبسّطة داخل الواجهة + `MISHKAT_ADMIN_TOKEN` |

## هل تريد حذفها نهائيًا؟

لا شيء في المشروع الحالي يعتمد عليها، فيمكنك حذف المجلد كاملًا بأمان:

```bash
rm -rf legacy/tmd-v1
```
