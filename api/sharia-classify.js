"use strict";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_CLASSIFY_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-20b";

function normalizeArabic(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function heuristic(text) {
  const q = normalizeArabic(text);
  const terms = [
    "الله","دين","اسلام","مسلم","قران","قرآن","سوره","اية","حديث","سنه","نبي","رسول","محمد","صحابي","شيخ","فتوى","حكم","حلال","حرام","واجب","فرض","سنة","مكروه","عقيده","توحيد","شرك","كفر","ايمان","صلاه","الصلاة","وضوء","غسل","تيمم","اذان","صيام","رمضان","زكاه","حج","عمره","صدقه","دعاء","اذكار","تفسير","فقه","سيره","تجويد","مسجد","جمعه","وتر","قيام الليل","نكاح","زواج","طلاق","ميراث","ربا","يمين","نذر","كفاره","جنه","نار","قيامه","ملائكه","شيطان","جن","الحاد","شبهه","ذنب","معصيه","توبه","عباده","طاعه","شرع","شرعي","العلماء","الداعيه","المشايخ","المصحف","سجود","ركوع","تشهد","استخاره","رقية","رقية شرعية","الزكاة","الصوم"
  ];
  const hits = terms.filter(t => q.includes(normalizeArabic(t)));
  const questionish = /^(هل|ما|ماذا|كيف|لماذا|متى|أين|من|ايه|إيه|ازاي|ازاى|ليه|لو|هل ينفع|ينفع|ممكن|عايز اعرف|اريد ان اعرف)/i.test(String(text || "").trim());
  return hits.length >= 1 || (questionish && /(صلاه|دين|الله|قران|حديث|رسول|حلال|حرام|يجوز|شرع|شيخ|فتوى|عباده|صيام|زكاه|حج|دعاء)/i.test(q));
}

function cleanSearchQuery(text) {
  return String(text || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const query = cleanSearchQuery(body.query);
  if (!query) return res.status(400).json({ ok: false, error: "query مطلوب" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: true, isSharia: heuristic(query), searchQuery: query });

  try {
    const prompt = `حدد هل السؤال التالي سؤال ديني/شرعي أم لا. اعتبر الأسئلة عن القرآن والحديث والنبي والصحابة والعقيدة والعبادات والمعاملات والأسرة والأخلاق والأذكار والتفسير والفتاوى وكل ما يسأل فيه المسلم عن دينه سؤالًا شرعيًا، حتى لو لم يستخدم كلمات مثل "حكم" أو "حرام" أو "فتوى"، وحتى لو كان بالعامية أو بصياغة غير مباشرة.
أخرج JSON فقط بهذا الشكل:
{"isSharia":true,"searchQuery":"صياغة قصيرة للبحث عن فيديو شرعي يجيب عن السؤال"}
السؤال: ${query}`;
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [
        { role: "system", content: "أنت مصنف أسئلة فقط. لا تجب عن السؤال." },
        { role: "user", content: prompt }
      ] })
    });
    const data = await r.json().catch(() => ({}));
    const raw = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw);
    return res.status(200).json({
      ok: true,
      isSharia: Boolean(parsed.isSharia),
      searchQuery: cleanSearchQuery(parsed.searchQuery) || query
    });
  } catch (error) {
    return res.status(200).json({ ok: true, isSharia: heuristic(query), searchQuery: query });
  }
};
