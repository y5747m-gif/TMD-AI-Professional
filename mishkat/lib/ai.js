"use strict";

/**
 * mishkat/lib/ai.js
 * ---------------------------------------------------------------
 * محرك الذكاء الاصطناعي (اختياري تمامًا):
 *   • مزوّدون متعددون (Gemini / Groq / OpenAI / OpenRouter / مخصّص)
 *     مع بثّ مباشر (SSE).
 *   • وظيفتان فقط:
 *       1) ترتيب نتائج إسلام ويب حسب صلتها بالسؤال.
 *       2) صياغة الرد المنقول من إسلام ويب وتنظيمه بلا زيادة معنى.
 *   • بدون أي مفتاح: يعمل «المحرك الناقل» فيعرض نص الجواب كما هو.
 * ---------------------------------------------------------------
 */

const config = require("./config");
const { excerpt } = require("./htmlx");
const rank = require("./rank");

/* ==============================================================
 *  تواريخ للسياق
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
 *  المزوّدون
 * ============================================================== */

function activeProvider() {
  return config.resolveProvider();
}

function providerInfo() {
  const provider = activeProvider();
  if (!provider) {
    return {
      enabled: false,
      id: "none",
      label: "المحرك الناقل (بلا مفتاح)",
      model: "",
      note: "تُعرض الردود منقولةً من موقع إسلام ويب مع روابطها، دون صياغة إضافية."
    };
  }
  return {
    enabled: true,
    id: provider.id,
    label: provider.label,
    model: provider.model,
    mode: config.AI_MODE,
    note: "يُستخدم لترتيب نتائج إسلام ويب وصياغة الرد المنقول عنها."
  };
}

function shortError(text) {
  try {
    const data = JSON.parse(text);
    return String(data?.error?.message || data?.message || text).slice(0, 300);
  } catch (_) {
    return String(text).slice(0, 300);
  }
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
      maxOutputTokens: config.AI.maxTokens
    }
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
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

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
        /* سطر غير صالح — يُتجاهل */
      }
    }
  }
}

/**
 * ينفّذ نداءً على المزوّد (بثّ إن أمكن).
 * @returns {Promise<{text:string, provider:string}>}
 */
async function callProvider({ system, messages, onToken, signal, stream = true }) {
  const provider = activeProvider();
  if (!provider) throw new Error("NO_PROVIDER");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI.timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    if (provider.id === "gemini") {
      const url = `${provider.base}/models/${encodeURIComponent(
        provider.model
      )}:${stream ? "streamGenerateContent?alt=sse&key=" : "generateContent?key="}${encodeURIComponent(
        provider.key
      )}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toGeminiBody({ system, messages })),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${shortError(await res.text().catch(() => ""))}`);
      if (!stream) {
        const data = await res.json();
        return { text: extractGeminiText(data), provider: provider.id };
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
      return { text, provider: provider.id };
    }

    const url = `${provider.base}/chat/completions`;
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
      body: JSON.stringify({ ...toOpenAiBody(provider, { system, messages }), stream }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`${provider.label} ${res.status}: ${shortError(await res.text().catch(() => ""))}`);
    }
    if (!stream) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || "";
      if (!text) throw new Error(`${provider.label} أعاد إجابة فارغة`);
      return { text, provider: provider.id };
    }
    let text = "";
    await readSse(res, (obj) => {
      const delta = obj?.choices?.[0]?.delta?.content || "";
      if (delta) {
        text += delta;
        if (onToken) onToken(delta);
      }
    });
    if (!text) throw new Error(`${provider.label} أعاد إجابة فارغة`);
    return { text, provider: provider.id };
  } finally {
    clearTimeout(timeout);
  }
}

/* ==============================================================
 *  1) ترتيب نتائج إسلام ويب
 * ============================================================== */

const RANK_SYSTEM = `أنت مساعد بحث فقهي دقيق.
تتلقى سؤال المستخدم، وقائمة مرشّحين من موقع إسلام ويب (فتاوى/استشارات/مقالات) لكل واحد رقم وعنوان ومقتطف.
مهمتك: إعادة ترتيب المرشّحين من الأكثر صلة بالسؤال إلى الأقل.
أعد JSON فقط بالشكل: {"order":[3,1,2]} حيث الأرقام هي أرقام المرشّحين.
لا تُجب عن السؤال، ولا تُضف أي كلام غير JSON.`;

/**
 * يرتّب المرشّحين بالذكاء الاصطناعي (مع الرجوع للترتيب اللفظي عند أي خطأ).
 * @returns {Promise<{order:Array, used:boolean, error?:string}>}
 */
async function rankCandidates({ question, candidates, signal }) {
  const lexical = candidates.map((c, i) => ({ index: i + 1, id: `${c.kind}:${c.id}` }));
  if (!activeProvider() || !config.AI.useRerank || candidates.length < 3) {
    return { order: lexical, used: false };
  }

  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}) [${c.kindLabel || c.kind}] ${c.title}\n   المقتطف: ${excerpt(c.snippet || "", 220)}`
    )
    .join("\n");

  try {
    const { text } = await callProvider({
      system: RANK_SYSTEM,
      messages: [{ role: "user", content: `السؤال: ${question}\n\nالمرشّحون:\n${list}\n\nأعد JSON فقط.` }],
      signal,
      stream: false
    });
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) throw new Error("لا JSON في الرد");
    const data = JSON.parse(match[0]);
    const raw = Array.isArray(data.order) ? data.order : [];
    const seen = new Set();
    const ordered = [];
    for (const num of raw) {
      const idx = Number(num) - 1;
      if (Number.isInteger(idx) && candidates[idx] && !seen.has(idx)) {
        seen.add(idx);
        ordered.push({ index: idx + 1, id: `${candidates[idx].kind}:${candidates[idx].id}` });
      }
    }
    for (const item of lexical) {
      if (!seen.has(item.index - 1)) ordered.push(item);
    }
    return { order: ordered, used: true };
  } catch (err) {
    return { order: lexical, used: false, error: String(err.message || err) };
  }
}

/* ==============================================================
 *  2) صياغة الرد منقولًا من إسلام ويب
 * ============================================================== */

const MODE_INSTRUCTIONS = {
  sources: `وضع النقل الحرفي:
- اعرض نص الجواب كما ورد في المصدر دون تغيير في المعنى.
- لا تُضِف أي حكم أو دليل أو قول من عندك، ولا تخترع أرقام فتاوى أو روابط.`,
  composed: `وضع الصياغة المنظَّمة:
- أعِد تنظيم نص الجواب الوارد في المصادر (فقرات ونقاط وعناوين) مع الحفاظ الكامل على المعنى.
- يمكنك تقديم خلاصة في البداية، لكن بلا أي إضافة علمية من خارج النصوص المرفقة.
- إن ذكر المصدر أقوالًا أو خلافًا فاذكره كما هو، وإن قيّد الحكم بقيود فلا تُسقطها.`
};

function systemPrompt({ mode = "composed" } = {}) {
  const modeText = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.composed;
  return `أنت «مشكاة»، مساعد عربي ينقل ردود موقع إسلام ويب (islamweb.net) بأمانة ويوثّقها.
تصلك «المصادر» مستخرجةً من صفحات إسلام ويب: كل مصدر له رقم ونوع (فتوى/استشارة/مقال) ورابط ونصّ سؤال ونصّ جواب.

قواعد إلزامية:
1) لا تُفتِ من عندك: كل حكم أو دليل أو ترجيح في إجابتك يجب أن يوجد نصًّا في المصادر المرفقة.
2) لا تخترع أرقام فتاوى ولا روابط ولا أسماء علماء ولا تخريجًا لأحاديث.
3) اذكر رقم المصدر ورابطه عند نقل الجواب، هكذا: (فتوى رقم 536365 — إسلام ويب) مع الرابط.
4) إن كانت المصادر لا تجيب على السؤال، قل صراحة: «لم أجد في موقع إسلام ويب جوابًا مباشرًا عن هذا السؤال» ثم اعرض أقرب ما وُجد.
5) اكتب بالعربية الفصيحة، بتنسيق Markdown منظّم، والاقتباس المباشر بصيغة > اقتباس.
6) اختِم دائمًا بقسم ## المصادر مبينًا النوع والرقم والرابط.
7) إن كان السؤال شخصيًا أو نازلة خاصة، فنبّه في آخر الإجابة أن الحكم يتبع تفصيل الحال وأن الأصل سؤال أهل العلم.

${modeText}

الهيكل المعتمد:
## الخلاصة
## الجواب منقولًا من إسلام ويب
## تفصيل المصادر الأخرى ذات الصلة   (إن وُجدت)
## تنبيهات
## المصادر`;
}

/** يبني سياق المصادر المرفقة إلى المحرك */
function buildContext(docs, maxChars = config.AI.contextChars) {
  if (!docs || !docs.length) return "«لا توجد مصادر مرفقة.»";
  const blocks = [];
  let used = 0;

  docs.forEach((doc, i) => {
    const meta = [
      `[المصدر ${i + 1}] النوع: ${doc.kindLabel || doc.kind} — الرقم: ${doc.number || doc.id}`,
      `العنوان: ${doc.title}`,
      `الرابط: ${doc.url}`,
      doc.date ? `التاريخ: ${doc.date}` : "",
      doc.answerer ? `المجيب: ${doc.answerer}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const question = doc.question ? `\nسؤال المصدر: ${doc.question}` : "";
    const answer = `\nنصّ الجواب في المصدر:\n${doc.answer || ""}`;
    const block = `${meta}${question}${answer}\n`;

    if (used + block.length > maxChars) {
      const room = Math.max(400, maxChars - used);
      blocks.push(`${meta}\nنصّ الجواب (مقتطف):\n${excerpt(doc.answer, room)}\n`);
      used = maxChars;
      return;
    }
    blocks.push(block);
    used += block.length;
  });

  return blocks.join("\n---\n");
}

function buildMessages({ question, docs, mode = "composed", history = [] }) {
  const context = buildContext(docs);
  const messages = [];
  const historyTurns = (history || []).slice(-4);
  for (const turn of historyTurns) {
    const role = turn.role === "assistant" ? "assistant" : "user";
    if (turn.content) messages.push({ role, content: String(turn.content).slice(0, 1500) });
  }
  messages.push({
    role: "user",
    content: `اليوم: ${gregorianDate()} (${hijriDate()}).
سؤال المستخدم: ${question}

=== المصادر المرفقة من إسلام ويب ===
${context}
=== نهاية المصادر ===

اكتب الإجابة وفق الهيكل والقواعد.`
  });
  return { system: systemPrompt({ mode }), messages };
}

/* ==============================================================
 *  3) الرد الناقل (بلا أي مفتاح ذكاء اصطناعي)
 * ============================================================== */

/**
 * يبني ردًّا منقولًا حرفيًا من مصادر إسلام ويب.
 * @param {{question:string, docs:Array, videos?:Array, notes?:string[]}} input
 */
function quotedAnswer({ question = "", docs = [], videos = [], notes = [] } = {}) {
  const lines = [];

  if (!docs.length) {
    lines.push("## لم أجد ردًّا في إسلام ويب");
    lines.push(
      "لم أعثر على فتوى أو استشارة أو مقال مطابق لسؤالك في موقع إسلام ويب. جرّب صياغة أخرى بكلمات فقهية أوضح."
    );
    lines.push("");
    lines.push("## ما الذي يمكنك فعله؟");
    lines.push(`- ابحث مباشرةً في مركز الفتوى: ${config.APP.islamwebHome}fatwa/`);
    lines.push("- صِغ السؤال بكلمات مفتاحية واحدة أو اثنتين (مثال: «زكاة الفطر»، «صلاة الجماعة»، «يمين الطلاق»).");
    lines.push("- في الأسئلة الشخصية الخاصة يُسأل أهل العلم مباشرةً.");
    if (videos.length) {
      lines.push("");
      lines.push("## فيديوهات ذات صلة بالسؤال");
      for (const v of videos) lines.push(`- [${v.title}](${v.url})`);
    }
    for (const note of notes) lines.push(`- ${note}`);
    return lines.join("\n");
  }

  const primary = docs[0];
  lines.push("## الخلاصة");
  lines.push(`> ${excerpt(primary.answer, 420)}`);
  lines.push("");
  lines.push(
    `هذا ما ورد في ${primary.kindLabel} رقم **${primary.number || primary.id}** على موقع إسلام ويب${
      primary.date ? ` (بتاريخ ${primary.date})` : ""
    }: [${primary.title}](${primary.url}).`
  );

  lines.push("");
  lines.push("## الجواب منقولًا من إسلام ويب");
  if (primary.question) {
    lines.push("### السؤال");
    lines.push(`> ${primary.question}`);
    lines.push("");
  }
  lines.push("### الإجابــة");
  lines.push(primary.answer || "—");
  lines.push("");
  lines.push(
    `المصدر: [${primary.title}](${primary.url}) — ${primary.kindLabel} رقم ${primary.number || primary.id}${
      primary.answerer ? ` — المجيب: ${primary.answerer}` : ""
    }.`
  );

  const others = docs.slice(1);
  if (others.length) {
    lines.push("");
    lines.push("## مصادر أخرى ذات صلة");
    for (const doc of others) {
      lines.push(`### ${doc.title}`);
      lines.push(`- النوع: ${doc.kindLabel} رقم ${doc.number || doc.id}${doc.date ? ` — ${doc.date}` : ""}`);
      lines.push(`- الرابط: [${doc.title}](${doc.url})`);
      if (doc.answer) lines.push("");
      if (doc.answer) lines.push(`> ${excerpt(doc.answer, 700)}`);
      lines.push("");
    }
  }

  if (videos.length) {
    lines.push("## فيديوهات ذات صلة بالسؤال");
    for (const v of videos) lines.push(`- [${v.title}](${v.url})`);
    lines.push("");
  }

  lines.push("## تنبيهات");
  lines.push(
    "- الرد منقول من موقع إسلام ويب (islamweb.net) مع توثيق الرقم والرابط، والأداة ناقلة لا مُفتية."
  );
  if (notes.length) for (const note of notes) lines.push(`- ${note}`);
  lines.push("- المسائل الشخصية والنوازل الخاصة يُرجع فيها إلى مفتٍ متخصص.");

  return lines.join("\n");
}

/* ==============================================================
 *  4) الواجهة الموحّدة
 * ============================================================== */

/**
 * ينتج الرد: إن وُجد مزوّد يصوغ نص المصادر، وإلا فعرض منقول.
 * @returns {Promise<{answer:string, provider:string, usedFallback:boolean, error?:string}>}
 */
async function composeAnswer({ question, docs, videos = [], mode = "composed", history = [], onToken, signal }) {
  const provider = activeProvider();
  if (!docs || !docs.length) {
    const answer = quotedAnswer({ question, docs: [], videos });
    if (onToken) onToken(answer);
    return { answer, provider: "quoted", usedFallback: false };
  }

  if (provider && config.AI.useCompose && mode !== "sources") {
    try {
      const { system, messages } = buildMessages({ question, docs, mode, history });
      const out = await callProvider({ system, messages, onToken, signal });
      return { answer: out.text, provider: out.provider, usedFallback: false };
    } catch (err) {
      const answer = quotedAnswer({ question, docs, videos });
      if (onToken) onToken(answer);
      return {
        answer,
        provider: "quoted",
        usedFallback: true,
        error: String(err.message || err)
      };
    }
  }

  const answer = quotedAnswer({ question, docs, videos });
  if (onToken) onToken(answer);
  return { answer, provider: "quoted", usedFallback: false };
}

module.exports = {
  activeProvider,
  providerInfo,
  callProvider,
  rankCandidates,
  composeAnswer,
  quotedAnswer,
  buildContext,
  buildMessages,
  systemPrompt,
  hijriDate,
  gregorianDate,
  MODE_INSTRUCTIONS
};
