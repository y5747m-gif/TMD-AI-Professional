"use strict";

const fs = require("fs");
const path = require("path");

function normalize(s) {
  return String(s || "").toLowerCase()
    .replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "").trim();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const query = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const q = normalize(query.query);
    if (!q) return res.status(400).json({ ok:false, found:false, error:"query is required" });

    const indexPath = path.join(process.cwd(), "references", "index.json");
    if (!fs.existsSync(indexPath)) return res.status(200).json({ ok:true, found:false, reason:"reference_index_missing" });
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const terms = q.split(/\s+/).filter(x => x.length >= 2);
    const scored = (Array.isArray(index.documents) ? index.documents : []).map(doc => {
      const hay = normalize(`${doc.title || ""} ${doc.text || ""}`);
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += t.length >= 4 ? 2 : 1;
      return {...doc, score};
    }).filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0,5);

    return res.status(200).json({ ok:true, found: scored.length > 0, results: scored });
  } catch (e) {
    return res.status(500).json({ ok:false, found:false, error:"Reference search failed" });
  }
};
