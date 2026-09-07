"use strict";

const CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

function cleanQuery(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "YOUTUBE_API_KEY غير مضبوط في Vercel." });
  }

  // القناة ثابتة على الخادم ولا نسمح للمتصفح بتغييرها.
  const query = cleanQuery(req.body?.query);
  if (!query) {
    return res.status(400).json({ ok: false, error: "query مطلوب" });
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    channelId: CHANNEL_ID,
    maxResults: "10",
    order: "relevance",
    relevanceLanguage: "ar",
    regionCode: "EG",
    key: apiKey
  });

  try {
    const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || "فشل البحث في YouTube",
        channelId: CHANNEL_ID
      });
    }

    // تحقق صارم من channelId قبل إرسال أي نتيجة للواجهة.
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter(item =>
        item?.id?.kind === "youtube#video" &&
        item?.id?.videoId &&
        item?.snippet?.channelId === CHANNEL_ID
      )
      .map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description || "",
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle || "",
        publishedAt: item.snippet.publishedAt || "",
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ""
      }));

    return res.status(200).json({
      ok: true,
      channelId: CHANNEL_ID,
      query,
      items
    });
  } catch (error) {
    console.error("sharia-search error:", error);
    return res.status(500).json({ ok: false, error: "تعذر الاتصال بـ YouTube Data API." });
  }
};
