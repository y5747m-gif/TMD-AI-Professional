"use strict";

function clean(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}
function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
function normalize(s) {
  return String(s || "").toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[ًٌٍَُِّْـ]/g,"");
}
function score(text, query) {
  const tokens = normalize(query).split(/\s+/).filter(x => x.length > 2);
  const t = normalize(text); let n = 0;
  for (const x of tokens) if (t.includes(x)) n += 1;
  return n;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  const query = clean(req.body?.query);
  if (!query) return res.status(400).json({ ok:false, error:"query مطلوب" });

  try {
    // Use Islamweb's own search endpoint. The source URL never goes to the client.
    const url = `https://www.islamweb.net/ar/search/index.php?query=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 TMD-AI/1.0" } });
    if (!r.ok) return res.status(200).json({ ok:true, found:false });
    const html = await r.text();

    const links = [];
    const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && links.length < 80) {
      const href = m[1];
      const title = stripHtml(m[2]);
      if (!title || title.length < 10) continue;
      if (!/fatwa|fatawa|فتوى|فتاوى/i.test(href + " " + title)) continue;
      const full = href.startsWith("http") ? href : `https://www.islamweb.net${href.startsWith("/") ? "" : "/"}${href}`;
      links.push({ href: full, title, score: score(title, query) });
    }
    links.sort((a,b)=>b.score-a.score);
    const best = links[0];
    if (!best) return res.status(200).json({ ok:true, found:false });

    const page = await fetch(best.href, { headers: { "User-Agent": "Mozilla/5.0 TMD-AI/1.0" } });
    if (!page.ok) return res.status(200).json({ ok:true, found:false });
    const body = stripHtml(await page.text());
    const marker = /(?:الجواب|الإجابة|الفتوى|الحمد لله|السؤال)/i;
    const idx = body.search(marker);
    let answer = idx >= 0 ? body.slice(idx, idx + 5000) : body.slice(0, 5000);
    answer = answer.replace(/\s+/g, " ").trim();
    if (answer.length < 80) return res.status(200).json({ ok:true, found:false });

    return res.status(200).json({ ok:true, found:true, title:best.title, answer });
  } catch (error) {
    console.error("islamweb-search error", error);
    return res.status(200).json({ ok:true, found:false });
  }
};
