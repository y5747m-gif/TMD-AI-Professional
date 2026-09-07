"use strict";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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

function heuristic(q) {
  const n = normalizeArabic(q);
  if (!n) return false;
  const terms = [
    "الله","الدين","اسلام","مسلم","قران","سوره","حديث","سنه","نبي","رسول","محمد",
    "صحابي","شيخ","فتوى","حكم","حلال","حرام","واجب","فرض","مكروه","مباح","عقيده",
    "توحيد","شرك","ايمان","صلاه","وضوء","غسل","تيمم","اذان","صيام","رمضان","زكاه",
    "حج","عمره","صدقه","دعاء","اذكار","استغفار","تفسير","فقه","سيره","تجويد","مسجد",
    "جمعه","وتر","قيام الليل","فجر","ظهر","عصر","مغرب","عشاء","نكاح","زواج","طلاق",
    "ميراث","ربا","بيع","شراء","يمين","نذر","كفاره","جنه","نار","قيامه","ملائكه",
    "شيطان","جن","الحاد","ملحد","شبهه","وسواس","ذنب","معصيه","توبه","عباده","طاعه",
    "رقية","مصحف","ايه","آيه","سور","سلف","علماء","داعيه","التحريم","التحليل",
    "يجوز","يصح","شرع","شرعي","فتاوى","النبي","الرسول","السنة","القرآن"
  ];
  return terms.some(t => n.includes(normalizeArabic(t)));
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const query = String(req.body?.query || "").trim();
  if (!query) return res.status(400).json({ ok: false, error: "query مطلوب" });

  // Heuristic catches obvious cases. Semantic classifier catches indirect formulations.
  if (heuristic(query)) return res.status(200).json({ ok: true, isSharia: true });

  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(200).json({ ok: true, isSharia: false });

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0,
        max_tokens: 8,
        messages: [
          { role: "system", content: "حدد فقط هل السؤال ديني/شرعي أم لا. أجب بكلمة YES أو NO فقط. اعتبر الأسئلة عن القرآن والحديث والنبي والصلاة والصيام والعقيدة والعبادات والمعاملات والأخلاق والأحكام والتوبة والذنوب والشبهات الدينية أسئلة دينية حتى لو لم تبدأ بعبارة ما الحكم." },
          { role: "user", content: query }
        ]
      })
    });
    const data = await r.json().catch(() => ({}));
    const text = String(data?.choices?.[0]?.message?.content || "").trim().toUpperCase();
    return res.status(200).json({ ok: true, isSharia: text.includes("YES") });
  } catch {
    return res.status(200).json({ ok: true, isSharia: heuristic(query) });
  }
};
