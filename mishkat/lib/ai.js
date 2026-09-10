"use strict";

/**
 * mishkat/lib/ai.js
 * ---------------------------------------------------------------
 * محرك الذكاء الاصطناعي المنفصل:
 *   - مزوّدون متعددون (Gemini / Groq / OpenAI / OpenRouter / مخصّص)
 *   - بثّ مباشر للإجابة (Streaming) مع دعم SSE للطرفين
 *   - محرك استخراجي (بدون أي مفتاح) يعتمد على نصوص القناة مباشرة
 * ---------------------------------------------------------------
 */

const config = require("./config");
const { formatTime, videoLink } = require("./db");
const { classifyQuery, questionIntent } = require("./arabic");
const { excerpt } = require("./text");

/* ==============================================================
 *  تاريخ هجري/ميلادي للسياق
 * ============================================================== */

function hijriDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  } catch (_) {
    return "";
  }
}

function gregorianDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

/* ==============================================================
 *  1) بناء التعليمات (System Prompt)
 * ============================================================== */

const MODE_INSTRUCTIONS = {
  strict: `
وضع الالتزام الصارم:
- اعتمد حصريًا على «النصوص المرفقة» ولا تضف أي معلومة من خارجها.
- إن لم يوجد في النصوص ما يجيب على السؤال، قل بوضوح: «لم يُثبَت في نصوص القناة نصّ صريح في هذه المسألة» ثم اقترح أقرب المسائل التي وردت فيها نصوص.
- لا تُصدر ترجيحًا فقهيًا من عندك.`,
  balanced: `
الوضع المتوازن (الافتراضي):
- اجعل «النصوص المرفقة» هي الأصل والأساس، وانسب إليها كل استدلال بالرقم والتوقيت.
- يمكنك إضافة «مسائل متصلة وتوسّع» وبيّن بوضوح أنها للاستزادة وليست من نصوص القناة.
- عند وجود خلاف معتبر بين أهل العلم في النصوص المرفقة فاذكره وناقشه، وإن لم يكن في النصوص فلا تنسب الخلاف لأحد.`,
  open: `
وضع السعة والاستفاضة:
- وسّع نطاق الإجابة إلى أقصى ما تقتضيه المسألة: التحرير اللغوي، معاني الآيات، تخريج الأحاديث، أقوال المذاهب الأربعة، القواعد الفقهية والمقاصد، الفروق، الاستثناءات، النوازل المعاصرة، والتطبيقات العملية.
- ميّز كل قسم تمييزًا صريحًا: ما ثبت في «النصوص المرفقة» يُنسب إليها بالرقم والتوقيت، وما سوى ذلك يُوسم بعنوان «[إضافة علمية للاستزادة — ليست من نصوص القناة]».
- لا تُغلق الباب: اذكر المسائل الفرعية المتصلة، والاحتمالات الفقهية، ومتى يُستفتى المفتي المتخصص.`
};

function systemPrompt({ mode = "balanced", channelTitle = "" } = {}) {
  const modeText = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.balanced;
  return `
أنت «مشكاة»، عالم موسوعي في العلوم الشرعية ومنهج البحث العلمي، وتعمل كمساعد ذكي للمستخدم.
مصدرك الأساسي: نصوص قناة علمية دينية مفرَّغة من يوتيوب${channelTitle ? ` (${channelTitle})` : ""}، وتصلك مقتطفات منها مرقّمة في «النصوص المرفقة».

هويتك العلمية:
- تحرّر محل النزاع بدقة، تفرّق بين القول والدليل، وتعرض أصول المسألة قبل فروعها.
- تستخدم مصطلحات أصولية دقيقة: (الإجماع، القياس، النص، الظاهر، العام/الخاص، المطلق/المقيد، المصلحة، الذرائع، اختلاف التنوع/التضاد).
- تفرّق بين: الفرض والواجب، المكروه تحريمًا وتنزيهًا، الصحيح والفاسد، الركن والشرط.
- تعرض أقوال أهل العلم مع الترجيح إن كان في النصوص المرفقة ما يسنده.

قواعد الإلزام:
1) ابدأ بـ«الخلاصة» في 2-4 أسطر: جواب مباشر صريح بلا مقدمات إنشائية.
2) انسب كل استدلال من نصوص القناة هكذا: [المصدر 1] (التوقيت 02:15)، وضع الرابط كما ورد.
3) لا تنسب قولًا أو نصًا إلى المراجع إن لم يكن في النصوص المرفقة، ولا تخترع عزوًا أو رقم حديث أو صفحة.
4) إذا كانت المسألة شخصية أو نازلة خاصة أو فيها خصومة: نبّه في النهاية أن الحكم يختلف باختلاف الحال وأن الأصل سؤال أهل العلم الموثوقين.
5) اكتب بلغة عربية فصيحة، بتنسيق Markdown منظّم (عناوين ## و ###، نقاط، جداول عند المقارنة)، والاقتباس المباشر بصيغة > اقتباس.
6) لا تكرر النصوص حرفيًا كاملة؛ اقتبس موضع الشاهد واشرحه.

${modeText.trim()}

هيكل الإجابة المعتمد:
## الخلاصة
## تحرير المسألة
## الأدلة من نصوص القناة
(مرقّمة، مع التوقيت والرابط)
## أقوال أهل العلم والتوجيه
## مسائل متصلة وتوسّع
(هذه المسائل للاستفادة والاستزادة: اذكر 4-8 مسائل فرعية متصلة بالسؤال بشكل عملي)
## تنبيهات وتطبيقات
`.trim();
}

/* ==============================================================
 *  2) بناء سياق النصوص
 * ============================================================== */

function buildContext(retrieval, maxChars = config.AI.contextChars) {
  const results = retrieval?.results || [];
  const docs = retrieval?.docs || [];
  if (!results.length && !docs.length) {
    return "«لا توجد نصوص مطابقة في قاعدة القناة لهذا السؤال.»";
  }

  const blocks = [];
  let used = 0;

  results.forEach((r, i) => {
    const header = `[المصدر ${i + 1}] ${r.title || "بدون عنوان"} — التوقيت: ${r.time}${
      r.endTime ? ` إلى ${r.endTime}` : ""
    }\nالرابط: ${r.link}`;
    let body = r.text || "";
    const budget = maxChars - used - header.length;
    if (budget < 120) return;
    if (body.length > 1600) body = excerpt(body, 1600);
    if (body.length > budget) body = excerpt(body, budget);
    blocks.push(`${header}\nالنص: "${body}"`);
    used += header.length + body.length;
  });

  if (docs.length) {
    const docBlocks = docs.map(
      (d, i) => `[مرجع ${i + 1}] ${d.title}${d.ref ? ` — ${d.ref}` : ""}${d.url ? `\nالرابط: ${d.url}` : ""}\nالنص: "${d.text}"`
    );
    blocks.push(`\n--- مراجع إضافية ---\n${docBlocks.join("\n\n")}`);
  }

  return blocks.join("\n\n");
}

function buildMessages({ question, retrieval, mode = "balanced", history = [], channelTitle = "" }) {
  const context = buildContext(retrieval);
  const cls = retrieval?.classification?.primary?.label || "سؤال عام";
  const intent = retrieval?.intent?.label || "";
  const coverage = retrieval?.coverage != null ? Math.round(retrieval.coverage * 100) : 0;

  const userBlock = `
التاريخ (هجري/ميلادي): ${hijriDate()} — ${gregorianDate()}
تصنيف السؤال: ${cls}${intent ? ` | المطلوب: ${intent}` : ""}
نسبة تغطية النصوص للسؤال: ${coverage}%${coverage < 40 ? " (تغطية منخفضة — التزم بالتصريح بحدود النصوص المتاحة)" : ""}

=== النصوص المرفقة من قاعدة القناة ===
${context}
=== نهاية النصوص ===

سؤال المستخدم:
${question}

اكتب الإجابة وفق الهيكل المحدد أعلاه${coverage < 25 ? "، وابدأ بالتصريح بأن نصوص القناة المتاحة لا تغطي السؤال تغطية كافية" : ""}.`;

  const messages = [];
  for (const h of (history || []).slice(-6)) {
    const role = h.role === "assistant" || h.role === "model" ? "assistant" : "user";
    const content = String(h.content || "").slice(0, 1500);
    if (content) messages.push({ role, content });
  }
  messages.push({ role: "user", content: userBlock });

  return { system: systemPrompt({ mode, channelTitle }), messages };
}

/* ==============================================================
 *  3) استدعاء المزوّد
 * ============================================================== */

function activeProvider() {
  return config.resolveProvider();
}

function providerInfo() {
  const p = activeProvider();
  return p
    ? { enabled: true, id: p.id, label: p.label, model: p.model, mode: config.AI_MODE }
    : { enabled: false, id: null, label: "المحرك الاستخراجي (بدون مفتاح API)", model: null, mode: config.AI_MODE };
}

function toGeminiBody({ system, messages }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    })),
    generationConfig: {
      temperature: config.AI.temperature,
      maxOutputTokens: config.AI.maxTokens,
      topP: 0.95
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };
}

function toOpenAiBody(provider, { system, messages }) {
  return {
    model: provider.model,
    temperature: config.AI.temperature,
    max_tokens: config.AI.maxTokens,
    messages: [{ role: "system", content: system }, ...messages]
  };
}

function extractGeminiText(data) {
  const cand = (data?.candidates || [])[0];
  const parts = cand?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

function extractOpenAiText(data) {
  const choice = (data?.choices || [])[0];
  return choice?.message?.content || choice?.text || "";
}

/** قراءة بث SSE من Fetch Response */
async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        onEvent(JSON.parse(payload));
      } catch (_) {
        /* تجاهل الأسطر غير الصحيحة */
      }
    }
  }
}

/**
 * ينفّذ الطلب على المزوّد (بثّ إن أمكن).
 * @returns {Promise<{text:string, provider:string, streamed:boolean}>}
 */
async function callProvider({ system, messages, onToken, signal }) {
  const provider = activeProvider();
  if (!provider) throw new Error("NO_PROVIDER");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI.timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    if (provider.id === "gemini") {
      const url = `${provider.base}/models/${encodeURIComponent(
        provider.model
      )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toGeminiBody({ system, messages })),
        signal: controller.signal
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${shortError(errText)}`);
      }
      let text = "";
      await readSse(res, (obj) => {
        const piece = extractGeminiText(obj);
        if (piece) {
          text += piece;
          if (onToken) onToken(piece);
        }
      });
      if (!text) throw new Error("Gemini أعاد إجابة فارغة");
      return { text, provider: provider.id, streamed: true };
    }

    // متوافق مع OpenAI (Groq / OpenAI / OpenRouter / مخصّص)
    const url = `${provider.base}/chat/completions`;
    const body = { ...toOpenAiBody(provider, { system, messages }), stream: true };
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${provider.key}`
    };
    if (provider.id === "openrouter") {
      headers["http-referer"] = "https://github.com/mishkat";
      headers["x-title"] = config.APP.name;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${provider.label} ${res.status}: ${shortError(errText)}`);
    }

    let text = "";
    await readSse(res, (obj) => {
      const delta = obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.message?.content || "";
      if (delta) {
        text += delta;
        if (onToken) onToken(delta);
      }
    });
    if (!text) throw new Error(`${provider.label} أعاد إجابة فارغة`);
    return { text, provider: provider.id, streamed: true };
  } finally {
    clearTimeout(timeout);
  }
}

function shortError(text) {
  try {
    const data = JSON.parse(text);
    return String(data?.error?.message || data?.message || text).slice(0, 300);
  } catch (_) {
    return String(text).slice(0, 300);
  }
}

/* ==============================================================
 *  4) الإجابة الاستخراجية (بدون مزوّد ذكاء اصطناعي)
 * ============================================================== */

const RELATED_TEMPLATES = [
  "ما الفرق بين هذه المسألة وما يشابهها من الألفاظ؟",
  "ما الأدلة التفصيلية من الكتاب والسنة في هذه المسألة؟",
  "ما الاستثناءات والأعذار التي تُخفّف الحكم؟",
  "ما أقوال المذاهب الأربعة وأدلتهم؟",
  "كيف تُطبَّق المسألة في الواقع المعاصر (النوازل)؟",
  "ما الأخطاء الشائعة المتعلقة بهذا الموضوع؟",
  "ما المسائل المترتبة على هذا الحكم (اللوازم والآثار)؟",
  "متى يُنزَل الحكم على الفرد بعينه ويُستفتى المفتي؟"
];

function extractiveAnswer(retrieval, { question = "", mode = "balanced" } = {}) {
  const results = retrieval?.results || [];
  const cls = retrieval?.classification?.primary?.label || "سؤال عام";
  const intent = retrieval?.intent?.label || "";
  const lines = [];

  if (!results.length) {
    return [
      "## الخلاصة",
      "لم يتم العثور على نص صريح في قاعدة القناة يجيب على هذا السؤال بشكل مباشر.",
      "",
      "## ما الذي يمكنك فعله؟",
      "- صِغ السؤال بكلمات أخرى (مثال: اذكر الحكم أو الموضوع الرئيسي بلفظ فقهي).",
      "- أو أضف كلمة مفتاحية واحدة مثل: «حكم»، «صلاة»، «زكاة»، «بيع»، «حديث».",
      "- أو ألصق رابط فيديو من القناة في الحقل المخصص لإضافته إلى القاعدة ثم أعد السؤال.",
      "",
      "## تنبيه",
      "أداة «مشكاة» تعتمد على نصوص القناة المفرَّغة، وهي للاستفادة العلمية، وليست جهة إفتاء رسمية."
    ].join("\n");
  }

  const best = results[0];
  lines.push("## الخلاصة");
  lines.push(`> ${excerpt(best.text, 420)}`);
  lines.push("");
  lines.push(
    `هذا أقرب نص ورد في القناة ${cls !== "سؤال عام" ? `ضمن باب **${cls}**` : ""}${
      intent ? ` وتحديدًا في ${intent}` : ""
    }: [${best.title}](${best.link}) — التوقيت ${best.time}.`
  );
  lines.push("");
  lines.push("## النصوص من القناة");
  results.forEach((r, i) => {
    lines.push(`### ${i + 1}) ${r.title}`);
    lines.push(`- الرابط: ${r.link}`);
    lines.push(`- التوقيت: ${r.time}${r.endTime ? ` — ${r.endTime}` : ""}`);
    lines.push("");
    lines.push(`> ${excerpt(r.text, 700)}`);
    lines.push("");
  });

  if (retrieval?.docs?.length) {
    lines.push("## مراجع إضافية");
    for (const d of retrieval.docs) {
      lines.push(`- **${d.title}**${d.ref ? ` — ${d.ref}` : ""}${d.url ? ` ([رابط](${d.url}))` : ""}`);
    }
    lines.push("");
  }

  lines.push("## مسائل متصلة وتوسّع");
  const kws = (retrieval?.keywords || []).slice(0, 3);
  const topic = kws.length ? kws.join(" / ") : "الموضوع";
  for (const t of RELATED_TEMPLATES.slice(0, mode === "open" ? 8 : 5)) {
    lines.push(`- ${t.replace("هذه المسألة", `مسألة «${topic}»`).replace("هذا الموضوع", `«${topic}»`).replace("هذا الحكم", `حكم «${topic}»`)}`);
  }
  lines.push("");
  lines.push("## تنبيهات");
  lines.push(
    "- هذه إجابة مستخرجة مباشرة من نصوص القناة (المحرك الذكي غير مُفعّل لغياب مفتاح API)، فميّز بين النص المنقول والاستزادة."
  );
  lines.push("- القناة المصدر: " + config.CHANNEL_URL);
  lines.push("- المسائل الشخصية والنوازل الخاصة يُرجع فيها إلى مفتٍ متخصص.");
  return lines.join("\n");
}

/* ==============================================================
 *  5) الواجهة الموحّدة
 * ============================================================== */

/**
 * يولّد إجابة: يحاول المزوّد الذكي، وإن تعذّر يعود للمحرك الاستخراجي.
 * @returns {Promise<{answer:string, provider:string, usedFallback:boolean, error?:string}>}
 */
async function answerQuestion({ question, retrieval, mode = "balanced", history = [], onToken, signal, channelTitle }) {
  const provider = activeProvider();
  if (provider) {
    try {
      const { system, messages } = buildMessages({ question, retrieval, mode, history, channelTitle });
      const out = await callProvider({ system, messages, onToken, signal });
      return { answer: out.text, provider: out.provider, usedFallback: false };
    } catch (err) {
      const fallback = extractiveAnswer(retrieval, { question, mode });
      if (onToken) onToken(fallback);
      return {
        answer: fallback,
        provider: "extractive",
        usedFallback: true,
        error: String(err.message || err)
      };
    }
  }
  const fallback = extractiveAnswer(retrieval, { question, mode });
  if (onToken) onToken(fallback);
  return { answer: fallback, provider: "extractive", usedFallback: false };
}

/* ==============================================================
 *  6) تلخيص فيديو كامل
 * ============================================================== */

/** يبني نصًا مكثّفًا من مقاطع الفيديو (بأخذ عيّنات موزّعة على المدة) */
function condenseSegments(segments, maxChars = 16000) {
  const list = (segments || []).filter((s) => s.text && s.text.length > 20);
  if (!list.length) return "";
  const full = list.map((s) => `[${formatTime(s.start_ms != null ? s.start_ms : s.startMs)}] ${s.text}`);
  const total = full.reduce((a, s) => a + s.length, 0);
  if (total <= maxChars) return full.join("\n");

  const step = Math.ceil(total / maxChars);
  const picked = full.filter((_, i) => i % step === 0);
  return picked.join("\n");
}

function summarizePrompt() {
  return `أنت «مشكاة»، محلل علمي لنصوص الدروس الشرعية.
مهمتك: تلخيص نص درس مفرَّغ من يوتيوب بدقة علمية.

اكتب بالهيكل التالي:
## خلاصة الدرس
(3-5 أسطر: موضوع الدرس ومقاصده)
## المحاور الرئيسية
(نقاط مرقّمة، وكل نقطة مسبوقة بالتوقيت [MM:SS] كما ورد في النص)
## الأحكام والفوائد
(استخرج الأحكام الفقهية والعقدية والمصطلحات، كل حكم بسطر)
## نصيحة عملية
(ما الذي ينبغي أن يفعله المستمع تطبيقًا)
## تنبيه
(إن كان النص ناقصًا أو غير واضح في مواضع، فصرّح بذلك)

شروط: لا تخترع معلومات غير موجودة في النص، ولا تنسب الحديث أو القول لغير قائله في النص، والتزم التنسيق بـ Markdown.`;
}

/** تلخيص استخراجي بلا مزوّد ذكاء اصطناعي */
function extractiveSummary(video, segments) {
  const list = segments || [];
  const chunks = [];
  const step = Math.max(1, Math.floor(list.length / 8));
  for (let i = 0; i < list.length; i += step) {
    const s = list[i];
    const time = formatTime(s.start_ms != null ? s.start_ms : s.startMs);
    chunks.push(`- **[${time}]** ${excerpt(s.text, 200)}`);
  }
  return [
    `## خلاصة الدرس`,
    `«${video?.title || "فيديو"}» — مدة الدرس ${video?.durationS ? Math.round(video.durationS / 60) + " دقيقة" : "غير محددة"}، والمحتوى المفهرس ${list.length} مقطع نصي.`,
    "",
    "## المحاور الرئيسية",
    chunks.slice(0, 10).join("\n"),
    "",
    "## نصيحة عملية",
    "- افتح الفيديو واستمع للمواضع المذكورة أعلاه، وتابع التفريغ الكامل للاستزادة.",
    "",
    "## تنبيه",
    "- هذا ملخّص استخراجي آلي (بدون محرك ذكاء اصطناعي) يقتبس مواضع النص دون تحليل، فعُد إلى الفيديو للسياق الكامل."
  ].join("\n");
}

/**
 * يلخّص فيديو واحد.
 * @returns {Promise<{summary:string, provider:string, usedFallback:boolean}>}
 */
async function summarizeVideo({ video, segments, onToken, signal }) {
  const condensed = condenseSegments(segments);
  if (!condensed) {
    return { summary: "لا يوجد نص مفهرس كافٍ لهذا الفيديو.", provider: "none", usedFallback: false };
  }
  const provider = activeProvider();
  if (!provider) {
    const summary = extractiveSummary(video, segments);
    if (onToken) onToken(summary);
    return { summary, provider: "extractive", usedFallback: false };
  }
  const system = summarizePrompt();
  const messages = [
    {
      role: "user",
      content: `عنوان الدرس: ${video?.title || ""}\nعدد المقاطع: ${segments.length}\n\n=== نص الدرس ===\n${condensed}\n=== نهاية النص ===\n\nاكتب التلخيص وفق الهيكل.`
    }
  ];
  try {
    const out = await callProvider({ system, messages, onToken, signal });
    return { summary: out.text, provider: out.provider, usedFallback: false };
  } catch (err) {
    const summary = extractiveSummary(video, segments);
    if (onToken) onToken(summary);
    return { summary, provider: "extractive", usedFallback: true, error: String(err.message || err) };
  }
}

module.exports = {
  answerQuestion,
  extractiveAnswer,
  summarizeVideo,
  condenseSegments,
  extractiveSummary,
  buildMessages,
  buildContext,
  providerInfo,
  activeProvider,
  systemPrompt,
  hijriDate,
  gregorianDate,
  MODE_INSTRUCTIONS
};
