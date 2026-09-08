"use strict";

const CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const API_TIMEOUT_MS = 9000;

function normalizeArabic(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanQuery(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function buildQueries(query) {
  const clean = cleanQuery(query);
  const normalized = normalizeArabic(clean);
  const stop = new Set([
    "ما","ماذا","هل","كيف","لماذا","متى","اين","أين","من","هو","هي","لي","في","عن","على","الى","إلى",
    "هذا","هذه","ذلك","تلك","يمكن","اريد","أريد","ممكن","لو","اذا","إذا","انا","أنا","عندي","هل"
  ]);
  const words = normalized.split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
  const core = words.slice(0, 10).join(" ");
  const queries = [
    clean,
    core,
    core ? `سؤال شرعي ${core}` : "سؤال شرعي",
    core ? `فتوى ${core}` : "فتوى",
    core ? `شرح ${core}` : "شرح شرعي"
  ];
  return [...new Set(queries.filter(Boolean))].slice(0, 5);
}

function tokens(query) {
  return normalizeArabic(query)
    .split(/\s+/)
    .filter(t => t.length >= 3)
    .slice(0, 16);
}

function scoreVideo(item, query) {
  const wanted = tokens(query);
  const title = normalizeArabic(item.title);
  const description = normalizeArabic(item.description);
  let score = 0;
  for (const token of wanted) {
    if (title.includes(token)) score += 10;
    else if (description.includes(token)) score += 3;
  }
  if (title.includes("فتوى")) score += 1;
  return score;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `YouTube API ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function searchYouTube(apiKey, query) {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    channelId: CHANNEL_ID,
    maxResults: "25",
    order: "relevance",
    relevanceLanguage: "ar",
    regionCode: "EG",
    key: apiKey
  });

  const data = await fetchJson(`${SEARCH_URL}?${params.toString()}`);
  return (Array.isArray(data.items) ? data.items : [])
    .filter(item => item?.id?.videoId && item?.snippet?.channelId === CHANNEL_ID)
    .map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title || "",
      description: item.snippet.description || "",
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle || "",
      publishedAt: item.snippet.publishedAt || "",
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ||
        item.snippet.thumbnails?.standard?.url ||
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url || ""
    }));
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return {}; }
  }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: "YOUTUBE_API_KEY غير مضبوط في Vercel." });

  const query = cleanQuery(parseBody(req).query);
  if (!query) return res.status(400).json({ ok: false, error: "query مطلوب" });

  try {
    const all = new Map();
    const queries = buildQueries(query);
    for (const searchQuery of queries) {
      const items = await searchYouTube(apiKey, searchQuery);
      for (const item of items) all.set(item.videoId, item);
    }

    const ranked = [...all.values()]
      .map(video => ({ video, score: scoreVideo(video, query) }))
      .sort((a, b) => b.score - a.score || new Date(b.video.publishedAt) - new Date(a.video.publishedAt));

    const best = ranked[0]?.video || null;
    if (!best) {
      return res.status(200).json({ ok: true, found: false, channelId: CHANNEL_ID, query, video: null });
    }

    return res.status(200).json({
      ok: true,
      found: true,
      channelId: CHANNEL_ID,
      query,
      video: {
        ...best,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(best.videoId)}`
      }
    });
  } catch (error) {
    console.error("sharia-search:", error);
    return res.status(200).json({
      ok: true,
      found: false,
      channelId: CHANNEL_ID,
      query,
      video: null,
      degraded: true
    });
  }
};
