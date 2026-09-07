"use strict";

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";

function clean(value, max = 180) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "YOUTUBE_API_KEY غير موجود في إعدادات Vercel. أضف مفتاح YouTube Data API v3."
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const query = clean(body.query);
    const channelId = clean(body.channelId || DEFAULT_CHANNEL_ID, 100);

    if (!query) {
      return res.status(400).json({ ok: false, error: "لم يتم إرسال نص البحث." });
    }

    // البحث مقيد بـ channelId + type=video؛ لا يوجد بحث عام في YouTube.
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      channelId,
      type: "video",
      maxResults: "5",
      order: "relevance",
      key: apiKey
    });

    const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("YouTube API Error:", data);
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || "تعذر البحث داخل القناة."
      });
    }

    const item = Array.isArray(data.items) ? data.items[0] : null;
    const videoId = item?.id?.videoId;

    if (!videoId) {
      return res.status(200).json({ ok: true, video: null });
    }

    return res.status(200).json({
      ok: true,
      video: {
        videoId,
        title: item?.snippet?.title || "فيديو شرعي",
        channelTitle: item?.snippet?.channelTitle || "القناة الشرعية",
        publishedAt: item?.snippet?.publishedAt || null,
        thumbnail: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.default?.url || null,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        channelId
      }
    });
  } catch (error) {
    console.error("Sharia search error:", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "حدث خطأ أثناء البحث داخل القناة."
    });
  }
};
