"use strict";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search";
const CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";

function cleanQuery(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
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
      error: "YOUTUBE_API_KEY غير موجود في إعدادات Vercel."
    });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

    const query = cleanQuery(body.query);
    if (!query) return res.status(400).json({ ok: false, error: "أرسل سؤالًا للبحث." });

    const url = new URL(YOUTUBE_API);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("channelId", CHANNEL_ID);
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "relevance");
    url.searchParams.set("maxResults", "5");
    url.searchParams.set("safeSearch", "moderate");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("YouTube API error:", data);
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || "تعذر البحث في قناة YouTube المحددة."
      });
    }

    // أمان إضافي: لا نعرض أي نتيجة إلا إذا كانت القناة مطابقة حرفيًا.
    const item = Array.isArray(data.items)
      ? data.items.find((entry) =>
          entry?.snippet?.channelId === CHANNEL_ID &&
          entry?.id?.kind === "youtube#video" &&
          entry?.id?.videoId
        )
      : null;

    if (!item) {
      return res.status(200).json({
        ok: true,
        video: null,
        searchedOnlyChannel: CHANNEL_ID
      });
    }

    const videoId = item.id.videoId;
    const title = item.snippet.title || "فيديو من القناة";

    return res.status(200).json({
      ok: true,
      searchedOnlyChannel: CHANNEL_ID,
      video: {
        videoId,
        title,
        channelId: CHANNEL_ID,
        channelTitle: item.snippet.channelTitle || "",
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      }
    });
  } catch (error) {
    console.error("Sharia channel search error:", error);
    return res.status(500).json({ ok: false, error: "حدث خطأ أثناء البحث داخل القناة." });
  }
};
