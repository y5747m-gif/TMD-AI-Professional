"use strict";

/*
 * مصدر الفيديوهات الشرعية الوحيد:
 * YouTube channel UCv0g_v1C6JcZALvrkDu98AQ
 *
 * لا يوجد fallback إلى YouTube العام أو أي موقع/قناة أخرى.
 */
const CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

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

function cleanQuery(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function scoreVideo(item, query) {
  const qTokens = normalizeArabic(query).split(/\s+/).filter(t => t.length > 2);
  const title = normalizeArabic(item?.snippet?.title);
  const desc = normalizeArabic(item?.snippet?.description);
  let score = 0;
  for (const token of qTokens) {
    if (title.includes(token)) score += 5;
    else if (desc.includes(token)) score += 1;
  }
  // العنوان أهم من الوصف.
  return score;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "YOUTUBE_API_KEY غير مضبوط في Vercel.",
      channelId: CHANNEL_ID
    });
  }

  const query = cleanQuery(req.body?.query);
  if (!query) {
    return res.status(400).json({ ok: false, error: "query مطلوب" });
  }

  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      channelId: CHANNEL_ID,
      maxResults: "25",
      order: "relevance",
      relevanceLanguage: "ar",
      key: apiKey
    });

    const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("YouTube API error:", data);
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || "فشل البحث في قناة YouTube المحددة.",
        channelId: CHANNEL_ID
      });
    }

    // تحقق مزدوج: API + channelId في كل نتيجة.
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter(item =>
        item?.id?.kind === "youtube#video" &&
        item?.id?.videoId &&
        item?.snippet?.channelId === CHANNEL_ID
      )
      .map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title || "",
        description: item.snippet.description || "",
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle || "",
        publishedAt: item.snippet.publishedAt || "",
        thumbnail:
          item.snippet.thumbnails?.maxres?.url ||
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          ""
      }))
      .sort((a, b) => scoreVideo(b, query) - scoreVideo(a, query));

    // لا يوجد fallback مطلقًا.
    if (!items.length) {
      return res.status(200).json({
        ok: true,
        found: false,
        channelId: CHANNEL_ID,
        query,
        video: null
      });
    }

    const best = items[0];

    // لا نعرض نتيجة إلا بعد التحقق النهائي.
    if (best.channelId !== CHANNEL_ID) {
      return res.status(200).json({
        ok: true,
        found: false,
        channelId: CHANNEL_ID,
        query,
        video: null
      });
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
    console.error("sharia-search error:", error);
    return res.status(500).json({
      ok: false,
      error: "تعذر الاتصال بـ YouTube Data API.",
      channelId: CHANNEL_ID
    });
  }
};
