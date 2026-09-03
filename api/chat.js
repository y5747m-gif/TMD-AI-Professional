const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "استخدم POST لهذا المسار."
    });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "GROQ_API_KEY غير موجود في Vercel."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const cleaned = messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-20)
      .map((m) => ({
        role: m.role,
        content: m.content.trim().slice(0, 12000)
      }))
      .filter((m) => m.content);

    if (!cleaned.length) {
      return res.status(400).json({
        ok: false,
        error: "اكتب رسالة أولًا."
      });
    }

    const model =
      process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const systemPrompt = `
أنت T.M.D AI، مساعد ذكاء اصطناعي عربي احترافي.

أجب باللغة التي يستخدمها المستخدم.

يمكنك مساعدة المستخدم في:
- الدراسة
- البرمجة
- الكتابة
- الترجمة
- المعلومات العامة
- البحث
- الأسئلة الدينية
- المقارنة بين الأديان والمذاهب

عند الأسئلة الدينية:

1. تعامل مع جميع الأديان والمذاهب باحترام.
2. لا تهاجم أو تسخر من أي دين أو طائفة.
3. يمكنك شرح الإسلام والمسيحية واليهودية وغيرها بصورة علمية ومحايدة.
4. يمكنك شرح القرآن والحديث والتفسير والفقه والكتاب المقدس والتقاليد والنصوص الدينية الأخرى عندما تكون المعلومات متاحة لك.
5. لا تخترع آية أو حديثًا أو نصًا دينيًا أو رقم آية أو حديث أو إصحاح.
6. لا تنسب قولًا إلى عالم أو كتاب إذا لم تكن متأكدًا من نسبته.
7. إذا لم تكن متأكدًا من مرجع ديني، صرّح بعدم التأكد بدل اختلاق المرجع.
8. إذا طلب المستخدم نصًا حرفيًا من كتاب ولم تكن متأكدًا من النص، أخبره بذلك.
9. عند وجود اختلاف بين المذاهب، وضّح الاختلاف ولا تعرض رأيًا واحدًا على أنه محل إجماع.
10. عند سؤال المستخدم عن فتوى إسلامية، قدّم شرحًا للمذاهب والأقوال الفقهية المعروفة، ولا تدّع أنك مفتٍ بشري.
11. في المسائل الشخصية أو الحساسة أو التي تحتاج حكمًا شرعيًا ملزمًا، انصح المستخدم بالرجوع إلى عالم أو مفتٍ موثوق.
12. عند مقارنة الأديان، اعرض مواقف كل تقليد ديني بصورة منصفة.
13. لا تختلق مصادر أو روابط أو اقتباسات.
14. الدقة أهم من السرعة.
15. إذا لم تعرف الإجابة، قل بوضوح إنك لا تعرف بدل التخمين.

أسلوب الإجابة:
- واضح
- منظم
- مفيد
- غير متكلف
- استخدم العناوين والنقاط عند الحاجة.
`;

    const response = await fetch(GROQ_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model,

        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...cleaned
        ],

        temperature: 0.2,
        max_completion_tokens: 2000
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data &&
        data.error &&
        data.error.message
          ? data.error.message
          : `Groq returned HTTP ${response.status}`;

      console.error("Groq API error:", data);

      return res.status(502).json({
        ok: false,
        error: message
      });
    }

    const text =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      typeof data.choices[0].message.content === "string"
        ? data.choices[0].message.content.trim()
        : "";

    if (!text) {
      console.error("Empty Groq response:", data);

      return res.status(502).json({
        ok: false,
        error: "لم تُرجع خدمة Groq نصًا."
      });
    }

    return res.status(200).json({
      ok: true,
      message: text,
      model
    });

  } catch (error) {
    console.error("TMD AI / Groq error:", error);

    return res.status(500).json({
      ok: false,
      error: "حدث خطأ داخلي في الخادم."
    });
  }
};
