"use strict";

/**
 * mishkat/lib/ingest.js
 * ---------------------------------------------------------------
 * خط سحب البيانات: يسرد فيديوهات القناة، يجلب نصوصها، ينظّفها،
 * يقسّمها، ثم يخزّنها في قاعدة البيانات مع التوقيت الزمني.
 * ---------------------------------------------------------------
 * الاستخدام:
 *   node mishkat/cli.js ingest            # كل الفيديوهات
 *   node mishkat/cli.js ingest --limit 20 # أول 20 فيديو
 *   node mishkat/cli.js ingest --force    # إعادة السحب حتى للموجود
 *   node mishkat/cli.js ingest --video ID # فيديو واحد
 * ---------------------------------------------------------------
 */

const config = require("./config");
const youtube = require("./youtube");
const { buildChunks } = require("./text");
const { normalizeArabic } = require("./arabic");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * يسحب فيديو واحد ويخزّنه.
 */
async function ingestOneVideo(store, videoId, { force = false, meta = null, onProgress } = {}) {
  const existing = store.hasVideo(videoId);
  if (existing && existing.has_transcript && !force) {
    return { videoId, status: "skipped", reason: "موجود مسبقًا" };
  }

  let info = meta;
  if (!info) {
    try {
      info = await youtube.fetchVideoMeta(videoId);
    } catch (rawErr) {
      const err = youtube.friendlyError(rawErr, "جلب بيانات الفيديو");
      store.upsertVideo({
        id: videoId,
        title: videoId,
        hasTranscript: false,
        sourceKind: "user",
        error: err.message
      });
      return { videoId, status: "failed", reason: err.message };
    }
  }

  try {
    const transcript = await youtube.fetchTranscript(videoId);
    const chunks = buildChunks(transcript.segments, { chunkChars: config.INGEST.chunkChars });
    if (!chunks.length) throw new Error("النص المستخرج فارغ");

    const chars = chunks.reduce((a, c) => a + c.text.length, 0);
    store.upsertVideo({
      id: videoId,
      title: info.title || videoId,
      description: info.description || "",
      publishedAt: info.publishedAt || "",
      durationS: info.durationS || 0,
      views: info.views || 0,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: info.thumbnail || "",
      sourceKind: info.sourceKind || "channel",
      hasTranscript: true,
      transcriptLang: transcript.lang,
      segmentsCount: chunks.length,
      chars,
      fetchedAt: new Date().toISOString(),
      error: ""
    });
    store.clearVideoSegments(videoId);
    store.addSegments(
      videoId,
      chunks.map((c) => ({
        idx: c.idx,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
        norm: normalizeArabic(c.text)
      }))
    );

    if (onProgress) {
      onProgress({ videoId, title: info.title, chunks: chunks.length, chars, status: "ok" });
    }
    return { videoId, status: "ok", chunks: chunks.length, chars, title: info.title };
  } catch (rawErr) {
    const err = youtube.friendlyError(rawErr, "جلب نص الفيديو");
    store.upsertVideo({
      id: videoId,
      title: info?.title || videoId,
      description: info?.description || "",
      publishedAt: info?.publishedAt || "",
      durationS: info?.durationS || 0,
      views: info?.views || 0,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: info?.thumbnail || "",
      sourceKind: info?.sourceKind || "channel",
      hasTranscript: false,
      segmentsCount: 0,
      chars: 0,
      fetchedAt: new Date().toISOString(),
      error: `لا يوجد نص: ${err.message}`.slice(0, 500)
    });
    return { videoId, status: "failed", reason: err.message, title: info?.title };
  }
}

/**
 * يسحب القناة كاملة.
 * @param {object} store متجر البيانات
 * @param {{max?:number, force?:boolean, onProgress?:Function, channelInfoOnly?:boolean}} opts
 */
async function ingestChannel(store, opts = {}) {
  const max = Number(opts.max || config.INGEST.maxVideos || 0);
  const force = !!opts.force;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};

  const knownList = store.listVideos({ limit: 100000, offset: 0 });
  const known = new Set(knownList.map((v) => v.id));

  onProgress({ phase: "listing", message: "جارٍ سرد فيديوهات القناة…" });

  const listed = await youtube.listChannelVideos({
    max,
    known,
    onProgress: (p) => onProgress({ phase: "listing", ...p })
  });

  const videos = listed.videos || [];
  onProgress({
    phase: "listed",
    total: videos.length,
    via: listed.via,
    channelTitle: listed.channelTitle,
    message: `تم العثور على ${videos.length} فيديو (المصدر: ${listed.via === "api" ? "YouTube API" : "استخراج مباشر"})`
  });

  if (listed.channelTitle) store.setMeta("channelTitle", listed.channelTitle);
  if (listed.channelThumb) store.setMeta("channelThumb", listed.channelThumb);
  store.setMeta("channelId", config.CHANNEL_ID);
  store.setMeta("channelUrl", config.CHANNEL_URL);

  const summary = {
    listed: videos.length,
    ok: 0,
    skipped: 0,
    failed: 0,
    chunks: 0,
    chars: 0,
    via: listed.via,
    failures: []
  };

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const res = await ingestOneVideo(store, v.id, {
      force,
      meta: v,
      onProgress: (p) => onProgress({ phase: "video", index: i + 1, total: videos.length, ...p })
    });

    if (res.status === "ok") {
      summary.ok++;
      summary.chunks += res.chunks || 0;
      summary.chars += res.chars || 0;
      onProgress({
        phase: "video",
        index: i + 1,
        total: videos.length,
        status: "ok",
        title: res.title,
        chunks: res.chunks,
        message: `[${i + 1}/${videos.length}] ✓ ${res.title || v.id} (${res.chunks} مقطع)`
      });
    } else if (res.status === "skipped") {
      summary.skipped++;
      onProgress({
        phase: "video",
        index: i + 1,
        total: videos.length,
        status: "skipped",
        message: `[${i + 1}/${videos.length}] ↺ ${v.title || v.id} — موجود مسبقًا`
      });
    } else {
      summary.failed++;
      summary.failures.push({ id: v.id, title: v.title, reason: res.reason });
      onProgress({
        phase: "video",
        index: i + 1,
        total: videos.length,
        status: "failed",
        message: `[${i + 1}/${videos.length}] ✗ ${v.title || v.id} — ${res.reason}`
      });
    }

    if (config.INGEST.delayMs > 0) await sleep(config.INGEST.delayMs);
  }

  // عند نجاح سحب نصوص حقيقية: تُحذف البيانات التجريبية تلقائيًا حتى لا تختلط بالمصادر
  if (summary.ok > 0) {
    try {
      const before = store.stats();
      if (before.demoVideos > 0) {
        const removed = store.deleteDemoData();
        summary.demoPurged = removed;
        onProgress({
          phase: "cleanup",
          message: `تم حذف ${removed} فيديو تجريبي تلقائيًا — القاعدة الآن على نصوص القناة الحقيقية.`
        });
      }
    } catch (_) {
      /* اختياري */
    }
  }

  store.setMeta("updatedAt", new Date().toISOString());
  store.setMeta("lastIngestSummary", JSON.stringify(summary));

  try {
    const exported = store.exportJsonIndex();
    summary.backup = exported;
  } catch (_) {
    /* النسخة الاحتياطية اختيارية */
  }

  store.logEvent("info", "ingest", JSON.stringify(summary).slice(0, 3000));
  onProgress({ phase: "done", summary });
  return summary;
}

module.exports = { ingestChannel, ingestOneVideo };
