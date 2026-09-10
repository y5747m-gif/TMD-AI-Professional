"use strict";

/**
 * mishkat/lib/db.js
 * ---------------------------------------------------------------
 * طبقة البيانات لقاعدة «مشكاة»:
 *   - المتجر الأساسي: SQLite (وحدة node:sqlite المدمجة — بلا مكتبات خارجية)
 *     مع فهارس FTS5 للبحث النصي العربي.
 *   - متجر بديل: ملف JSON (index.json) يعمل في أي بيئة لا تدعم node:sqlite
 *     (مثل بعض بيئات الاستضافة) — بنفس الواجهة تمامًا.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { normalizeArabic, contentTokens, lightStem } = require("./arabic");

/* ==============================================================
 *  أدوات مشتركة
 * ============================================================== */

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

/** يبني عبارة FTS5 آمنة لمجموعة كلمات (OR داخلي) */
function ftsGroupExpr(group) {
  const safe = group
    .map((t) => String(t).replace(/"/g, "").trim())
    .filter((t) => t.length >= 2)
    .map((t) => `"${t}"`);
  if (!safe.length) return "";
  return `(${safe.join(" OR ")})`;
}

function ftsAnd(groups) {
  return groups.map(ftsGroupExpr).filter(Boolean).join(" AND ");
}

function ftsOr(groups) {
  return groups.map(ftsGroupExpr).filter(Boolean).join(" OR ");
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function videoLink(videoId, startMs) {
  if (!videoId) return "";
  const t = Math.floor(Number(startMs || 0) / 1000);
  return t > 0
    ? `https://www.youtube.com/watch?v=${videoId}&t=${t}s`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

/* ==============================================================
 *  المتجر الأول: SQLite
 * ============================================================== */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  published_at TEXT DEFAULT '',
  duration_s INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  url TEXT DEFAULT '',
  thumbnail TEXT DEFAULT '',
  source_kind TEXT DEFAULT 'channel',
  has_transcript INTEGER DEFAULT 0,
  transcript_lang TEXT DEFAULT '',
  segments_count INTEGER DEFAULT 0,
  chars INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT '',
  error TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  norm TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_segments_video ON segments(video_id);

CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
  norm,
  video_id UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT DEFAULT 'reference',
  title TEXT DEFAULT '',
  ref TEXT DEFAULT '',
  url TEXT DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  norm TEXT NOT NULL DEFAULT '',
  meta TEXT DEFAULT '{}',
  created_at TEXT DEFAULT ''
);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  norm,
  doc_id UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT '',
  level TEXT DEFAULT 'info',
  event TEXT DEFAULT '',
  message TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT '',
  q TEXT DEFAULT '',
  norm TEXT DEFAULT ''
);
`;

class SqliteStore {
  constructor(dbPath) {
    const { DatabaseSync } = require("node:sqlite");
    ensureDir(path.dirname(dbPath));
    this.kind = "sqlite";
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(SCHEMA);
    this._stmtCache = new Map();
  }

  _stmt(sql) {
    let s = this._stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this._stmtCache.set(sql, s);
    }
    return s;
  }

  /* ---------------- الفيديوهات ---------------- */

  upsertVideo(v) {
    const sql = `
      INSERT INTO videos (id, title, description, published_at, duration_s, views, url, thumbnail, source_kind, has_transcript, transcript_lang, segments_count, chars, fetched_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        published_at = excluded.published_at,
        duration_s = excluded.duration_s,
        views = excluded.views,
        url = excluded.url,
        thumbnail = excluded.thumbnail,
        source_kind = excluded.source_kind,
        has_transcript = excluded.has_transcript,
        transcript_lang = excluded.transcript_lang,
        segments_count = excluded.segments_count,
        chars = excluded.chars,
        fetched_at = excluded.fetched_at,
        error = excluded.error
    `;
    this._stmt(sql).run(
      String(v.id),
      String(v.title || ""),
      String(v.description || ""),
      String(v.publishedAt || ""),
      Number(v.durationS || 0),
      Number(v.views || 0),
      String(v.url || videoLink(v.id, 0)),
      String(v.thumbnail || ""),
      String(v.sourceKind || "channel"),
      v.hasTranscript ? 1 : 0,
      String(v.transcriptLang || ""),
      Number(v.segmentsCount || 0),
      Number(v.chars || 0),
      v.fetchedAt || nowIso(),
      String(v.error || "")
    );
  }

  updateVideoError(videoId, message) {
    this._stmt("UPDATE videos SET error = ?, fetched_at = ? WHERE id = ?").run(
      String(message || ""),
      nowIso(),
      String(videoId)
    );
  }

  hasVideo(videoId) {
    const row = this._stmt("SELECT id, has_transcript FROM videos WHERE id = ?").get(String(videoId));
    return row || null;
  }

  clearVideoSegments(videoId) {
    this._stmt("DELETE FROM segments_fts WHERE video_id = ?").run(String(videoId));
    this._stmt("DELETE FROM segments WHERE video_id = ?").run(String(videoId));
  }

  addSegments(videoId, segments) {
    if (!segments || !segments.length) return 0;
    const insert = this._stmt(
      "INSERT INTO segments (video_id, idx, start_ms, end_ms, text, norm) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertFts = this._stmt(
      "INSERT INTO segments_fts (rowid, norm, video_id) VALUES (?, ?, ?)"
    );
    let count = 0;
    this.db.exec("BEGIN");
    try {
      segments.forEach((seg, i) => {
        const norm = seg.norm || normalizeArabic(seg.text);
        const res = insert.run(
          String(videoId),
          Number(seg.idx != null ? seg.idx : i),
          Number(seg.startMs || 0),
          Number(seg.endMs || 0),
          String(seg.text || ""),
          norm
        );
        insertFts.run(Number(res.lastInsertRowid), norm, String(videoId));
        count++;
      });
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return count;
  }

  deleteDemoData() {
    const ids = this._stmt("SELECT id FROM videos WHERE source_kind = 'demo'").all().map((r) => r.id);
    for (const id of ids) this.clearVideoSegments(id);
    this._stmt("DELETE FROM videos WHERE source_kind = 'demo'").run();
    // حذف فهرس المستندات أولًا ثم المستندات
    this._stmt("DELETE FROM docs_fts WHERE doc_id IN (SELECT id FROM docs WHERE kind = 'demo')").run();
    this._stmt("DELETE FROM docs WHERE kind = 'demo'").run();
    return ids.length;
  }

  /* ---------------- المستندات المرجعية ---------------- */

  addDoc(doc) {
    const norm = normalizeArabic(`${doc.title || ""} ${doc.ref || ""} ${doc.text || ""}`);
    const res = this._stmt(
      "INSERT INTO docs (kind, title, ref, url, text, norm, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      String(doc.kind || "reference"),
      String(doc.title || ""),
      String(doc.ref || ""),
      String(doc.url || ""),
      String(doc.text || ""),
      norm,
      JSON.stringify(doc.meta || {}),
      nowIso()
    );
    this._stmt("INSERT INTO docs_fts (rowid, norm, doc_id) VALUES (?, ?, ?)").run(
      Number(res.lastInsertRowid),
      norm,
      Number(res.lastInsertRowid)
    );
    return Number(res.lastInsertRowid);
  }

  countDocs() {
    return Number(this._stmt("SELECT COUNT(*) AS c FROM docs").get().c || 0);
  }

  /* ---------------- البحث ---------------- */

  /**
   * بحث FTS5. يعيد نتائج مرتّبة تصاعديًا حسب bm25 (الأقل أفضل).
   * @param {string[][]} groups مجموعات الكلمات
   * @param {{limit?:number, mode?:'and'|'or'}} opts
   */
  searchSegments(groups, opts = {}) {
    const limit = Number(opts.limit || 60);
    const mode = opts.mode === "or" ? "or" : "and";
    const expr = mode === "and" ? ftsAnd(groups) : ftsOr(groups);
    if (!expr) return [];

    const sql = `
      SELECT
        segments_fts.rowid AS seg_id,
        segments.video_id AS video_id,
        segments.start_ms AS start_ms,
        segments.end_ms AS end_ms,
        segments.text AS text,
        videos.title AS title,
        videos.url AS url,
        videos.published_at AS published_at,
        videos.source_kind AS source_kind,
        bm25(segments_fts) AS rank
      FROM segments_fts
      JOIN segments ON segments.id = segments_fts.rowid
      JOIN videos ON videos.id = segments.video_id
      WHERE segments_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    try {
      const rows = this._stmt(sql).all(expr, limit);
      return rows.map((r) => ({
        segId: Number(r.seg_id),
        videoId: String(r.video_id),
        startMs: Number(r.start_ms || 0),
        endMs: Number(r.end_ms || 0),
        text: String(r.text || ""),
        title: String(r.title || ""),
        url: String(r.url || videoLink(r.video_id, 0)),
        publishedAt: String(r.published_at || ""),
        sourceKind: String(r.source_kind || "channel"),
        score: -Number(r.rank || 0)
      }));
    } catch (err) {
      // عبارة FTS غير صحيحة => لا نتائج بدل الانهيار
      return [];
    }
  }

  /** بحث احتياطي بـ LIKE (للكلمات الخارجة عن الفهرسة/الأخطاء الإملائية) */
  likeSearch(tokens, opts = {}) {
    const list = (tokens || []).filter((t) => t && t.length >= 3).slice(0, 6);
    if (!list.length) return [];
    const where = list.map(() => "(segments.norm LIKE ? OR segments.norm LIKE ?)").join(" OR ");
    const params = [];
    for (const t of list) {
      params.push(`%${t}%`);
      const stem = lightStem(t);
      params.push(`%${stem}%`);
    }
    params.push(Number(opts.limit || 40));
    const sql = `
      SELECT segments.id AS seg_id, segments.video_id AS video_id, segments.start_ms AS start_ms,
             segments.end_ms AS end_ms, segments.text AS text, videos.title AS title,
             videos.url AS url, videos.published_at AS published_at, videos.source_kind AS source_kind
      FROM segments
      JOIN videos ON videos.id = segments.video_id
      WHERE ${where}
      LIMIT ?
    `;
    try {
      const rows = this._stmt(sql).all(...params);
      return rows.map((r) => ({
        segId: Number(r.seg_id),
        videoId: String(r.video_id),
        startMs: Number(r.start_ms || 0),
        endMs: Number(r.end_ms || 0),
        text: String(r.text || ""),
        title: String(r.title || ""),
        url: String(r.url || ""),
        publishedAt: String(r.published_at || ""),
        sourceKind: String(r.source_kind || "channel"),
        score: 0
      }));
    } catch (_) {
      return [];
    }
  }

  searchDocs(groups, opts = {}) {
    const limit = Number(opts.limit || 10);
    const expr = ftsOr(groups);
    if (!expr) return [];
    const sql = `
      SELECT docs_fts.rowid AS doc_id, docs.title AS title, docs.ref AS ref, docs.url AS url,
             docs.text AS text, docs.kind AS kind, bm25(docs_fts) AS rank
      FROM docs_fts
      JOIN docs ON docs.id = docs_fts.rowid
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    try {
      return this._stmt(sql).all(expr, limit).map((r) => ({
        docId: Number(r.doc_id),
        title: String(r.title || ""),
        ref: String(r.ref || ""),
        url: String(r.url || ""),
        text: String(r.text || ""),
        kind: String(r.kind || "reference"),
        score: -Number(r.rank || 0)
      }));
    } catch (_) {
      return [];
    }
  }

  /* ---------------- قراءات وإحصاءات ---------------- */

  getVideo(videoId) {
    return this._stmt("SELECT * FROM videos WHERE id = ?").get(String(videoId)) || null;
  }

  getVideoSegments(videoId) {
    return this._stmt(
      "SELECT id, idx, start_ms, end_ms, text FROM segments WHERE video_id = ? ORDER BY idx ASC"
    ).all(String(videoId));
  }

  listVideos(opts = {}) {
    const limit = Number(opts.limit || 50);
    const offset = Number(opts.offset || 0);
    const q = normalizeArabic(opts.q || "");
    let rows;
    if (q) {
      rows = this._stmt(
        `SELECT * FROM videos
         WHERE lower(title) LIKE ? OR lower(description) LIKE ? OR id = ?
         ORDER BY published_at DESC LIMIT ? OFFSET ?`
      ).all(`%${String(opts.q).toLowerCase().trim()}%`, `%${String(opts.q).toLowerCase().trim()}%`, String(opts.q || ""), limit, offset);
    } else {
      rows = this._stmt(
        "SELECT * FROM videos ORDER BY published_at DESC LIMIT ? OFFSET ?"
      ).all(limit, offset);
    }
    return rows.map(mapVideoRow);
  }

  stats() {
    const v = this._stmt(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN has_transcript = 1 THEN 1 ELSE 0 END) AS with_transcript,
              SUM(CASE WHEN source_kind = 'demo' THEN 1 ELSE 0 END) AS demo,
              SUM(segments_count) AS segments,
              SUM(chars) AS chars,
              SUM(duration_s) AS seconds
       FROM videos`
    ).get();
    return {
      store: "sqlite",
      videos: Number(v.total || 0),
      videosWithTranscript: Number(v.with_transcript || 0),
      demoVideos: Number(v.demo || 0),
      segments: Number(v.segments || 0),
      chars: Number(v.chars || 0),
      hours: Math.round((Number(v.seconds || 0) / 3600) * 10) / 10,
      docs: this.countDocs(),
      dbPath: this.dbPath,
      sizeBytes: safeSize(this.dbPath),
      updatedAt: this.getMeta("updatedAt") || ""
    };
  }

  setMeta(k, v) {
    this._stmt(
      "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
    ).run(String(k), String(v));
  }

  getMeta(k) {
    const row = this._stmt("SELECT v FROM meta WHERE k = ?").get(String(k));
    return row ? String(row.v) : "";
  }

  logEvent(level, event, message) {
    try {
      this._stmt("INSERT INTO logs (ts, level, event, message) VALUES (?, ?, ?, ?)").run(
        nowIso(),
        String(level || "info"),
        String(event || ""),
        String(message || "").slice(0, 4000)
      );
    } catch (_) {
      /* لا نُفشل العملية بسبب السجل */
    }
  }

  getLogs(limit = 50) {
    return this._stmt("SELECT * FROM logs ORDER BY id DESC LIMIT ?").all(Number(limit));
  }

  saveQuery(q) {
    try {
      this._stmt("INSERT INTO queries (ts, q, norm) VALUES (?, ?, ?)").run(nowIso(), String(q), normalizeArabic(q));
    } catch (_) {
      /* تجاهل */
    }
  }

  topQueries(limit = 10) {
    try {
      return this._stmt(
        "SELECT norm AS q, COUNT(*) AS c FROM queries GROUP BY norm ORDER BY c DESC LIMIT ?"
      ).all(Number(limit));
    } catch (_) {
      return [];
    }
  }

  /* ---------------- التصدير إلى JSON (بديل/نسخة احتياطية) ---------------- */

  exportJsonIndex(filePath = config.JSON_INDEX_PATH) {
    const videos = this._stmt("SELECT * FROM videos ORDER BY published_at ASC").all();
    const segStmt = this.db.prepare(
      "SELECT start_ms, end_ms, text FROM segments WHERE video_id = ? ORDER BY idx ASC"
    );
    const out = {
      format: "mishkat-index/v1",
      generatedAt: nowIso(),
      channel: {
        id: config.CHANNEL_ID,
        url: config.CHANNEL_URL
      },
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        publishedAt: v.published_at,
        durationS: v.duration_s,
        views: v.views,
        url: v.url,
        thumbnail: v.thumbnail,
        sourceKind: v.source_kind,
        transcriptLang: v.transcript_lang,
        segments: segStmt.all(v.id).map((s) => [Number(s.start_ms), Number(s.end_ms), String(s.text)])
      })),
      docs: this._stmt("SELECT kind, title, ref, url, text FROM docs").all()
    };
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(out), "utf8");
    return { file: filePath, videos: out.videos.length, bytes: Buffer.byteLength(JSON.stringify(out)) };
  }

  close() {
    try {
      this.db.close();
    } catch (_) {
      /* تجاهل */
    }
  }
}

function safeSize(file) {
  try {
    return fs.statSync(file).size;
  } catch (_) {
    return 0;
  }
}

function mapVideoRow(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    publishedAt: r.published_at,
    durationS: Number(r.duration_s || 0),
    views: Number(r.views || 0),
    url: r.url || videoLink(r.id, 0),
    thumbnail: r.thumbnail,
    sourceKind: r.source_kind,
    hasTranscript: !!r.has_transcript,
    transcriptLang: r.transcript_lang,
    segmentsCount: Number(r.segments_count || 0),
    chars: Number(r.chars || 0),
    fetchedAt: r.fetched_at,
    error: r.error
  };
}

/* ==============================================================
 *  المتجر الثاني: JSON (بديل متوافق)
 * ============================================================== */

class JsonStore {
  constructor(filePath) {
    this.kind = "json";
    this.filePath = filePath;
    this.videos = new Map();
    this.docs = [];
    this.logs = [];
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      for (const v of data.videos || []) {
        this.videos.set(v.id, {
          ...v,
          segments: (v.segments || []).map((s, i) => ({
            idx: i,
            startMs: s[0],
            endMs: s[1],
            text: s[2],
            norm: normalizeArabic(s[2])
          }))
        });
      }
      this.docs = (data.docs || []).map((d, i) => ({
        ...d,
        id: i + 1,
        norm: normalizeArabic(`${d.title || ""} ${d.ref || ""} ${d.text || ""}`)
      }));
    } catch (err) {
      this.logs.push({ ts: nowIso(), level: "error", event: "json_load", message: String(err.message || err) });
    }
  }

  persist() {
    const out = {
      format: "mishkat-index/v1",
      generatedAt: nowIso(),
      channel: { id: config.CHANNEL_ID, url: config.CHANNEL_URL },
      videos: [...this.videos.values()].map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        publishedAt: v.publishedAt,
        durationS: v.durationS,
        views: v.views,
        url: v.url,
        thumbnail: v.thumbnail,
        sourceKind: v.sourceKind,
        transcriptLang: v.transcriptLang,
        segments: (v.segments || []).map((s) => [s.startMs, s.endMs, s.text])
      })),
      docs: this.docs.map((d) => ({ kind: d.kind, title: d.title, ref: d.ref, url: d.url, text: d.text }))
    };
    ensureDir(path.dirname(this.filePath));
    fs.writeFileSync(this.filePath, JSON.stringify(out), "utf8");
  }

  upsertVideo(v) {
    const existing = this.videos.get(v.id) || { segments: [] };
    this.videos.set(v.id, {
      ...existing,
      ...v,
      url: v.url || videoLink(v.id, 0),
      sourceKind: v.sourceKind || "channel",
      segments: existing.segments || []
    });
  }

  updateVideoError(videoId, message) {
    const v = this.videos.get(videoId);
    if (v) {
      v.error = String(message || "");
      v.fetchedAt = nowIso();
    }
  }

  hasVideo(videoId) {
    const v = this.videos.get(videoId);
    return v ? { id: v.id, has_transcript: v.hasTranscript ? 1 : 0 } : null;
  }

  clearVideoSegments(videoId) {
    const v = this.videos.get(videoId);
    if (v) v.segments = [];
  }

  addSegments(videoId, segments) {
    const v = this.videos.get(videoId);
    if (!v) return 0;
    v.segments = segments.map((s, i) => ({
      idx: s.idx != null ? s.idx : i,
      startMs: Number(s.startMs || 0),
      endMs: Number(s.endMs || 0),
      text: String(s.text || ""),
      norm: s.norm || normalizeArabic(s.text)
    }));
    return v.segments.length;
  }

  deleteDemoData() {
    let n = 0;
    for (const [id, v] of [...this.videos.entries()]) {
      if (v.sourceKind === "demo") {
        this.videos.delete(id);
        n++;
      }
    }
    this.docs = this.docs.filter((d) => d.kind !== "demo");
    return n;
  }

  addDoc(doc) {
    const id = this.docs.length + 1;
    this.docs.push({
      id,
      kind: doc.kind || "reference",
      title: doc.title || "",
      ref: doc.ref || "",
      url: doc.url || "",
      text: doc.text || "",
      norm: normalizeArabic(`${doc.title || ""} ${doc.ref || ""} ${doc.text || ""}`)
    });
    return id;
  }

  countDocs() {
    return this.docs.length;
  }

  _scan(groups, limit) {
    const primary = groups.map((g) => g[0]).filter(Boolean);
    const flat = new Set(groups.flat());
    const results = [];
    for (const v of this.videos.values()) {
      for (const seg of v.segments || []) {
        const tokens = new Set(contentTokens(seg.text));
        let hitPrimary = 0;
        let hitAny = 0;
        for (const p of primary) {
          if (seg.norm.includes(p)) hitPrimary++;
          else if (tokens.has(p)) hitPrimary++;
        }
        for (const t of flat) {
          if (seg.norm.includes(t)) hitAny++;
        }
        if (!hitPrimary && !hitAny) continue;
        const score = hitPrimary * 3 + hitAny * 0.6;
        results.push({
          segId: seg.idx,
          videoId: v.id,
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text,
          title: v.title,
          url: v.url,
          publishedAt: v.publishedAt,
          sourceKind: v.sourceKind || "channel",
          score
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  searchSegments(groups, opts = {}) {
    return this._scan(groups, Number(opts.limit || 60));
  }

  likeSearch(tokens, opts = {}) {
    const groups = (tokens || []).map((t) => [t, lightStem(t)]);
    return this._scan(groups, Number(opts.limit || 40));
  }

  searchDocs(groups, opts = {}) {
    const flat = groups.flat().filter(Boolean);
    const limit = Number(opts.limit || 10);
    const out = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of flat) if (d.norm.includes(t)) score += t.length >= 4 ? 2 : 1;
      if (score > 0) out.push({ ...d, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  getVideo(videoId) {
    const v = this.videos.get(videoId);
    if (!v) return null;
    return {
      id: v.id,
      title: v.title,
      description: v.description || "",
      published_at: v.publishedAt || "",
      duration_s: v.durationS || 0,
      views: v.views || 0,
      url: v.url || videoLink(v.id, 0),
      thumbnail: v.thumbnail || "",
      source_kind: v.sourceKind || "channel",
      has_transcript: v.hasTranscript ? 1 : 0,
      transcript_lang: v.transcriptLang || "",
      segments_count: (v.segments || []).length,
      chars: (v.segments || []).reduce((a, s) => a + (s.text || "").length, 0),
      fetched_at: v.fetchedAt || "",
      error: v.error || ""
    };
  }

  getVideoSegments(videoId) {
    const v = this.videos.get(videoId);
    if (!v) return [];
    return (v.segments || []).map((s) => ({
      id: s.idx,
      idx: s.idx,
      start_ms: s.startMs,
      end_ms: s.endMs,
      text: s.text
    }));
  }

  listVideos(opts = {}) {
    const limit = Number(opts.limit || 50);
    const offset = Number(opts.offset || 0);
    let list = [...this.videos.values()].map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description || "",
      publishedAt: v.publishedAt || "",
      durationS: v.durationS || 0,
      views: v.views || 0,
      url: v.url || videoLink(v.id, 0),
      thumbnail: v.thumbnail || "",
      sourceKind: v.sourceKind || "channel",
      hasTranscript: !!v.hasTranscript,
      transcriptLang: v.transcriptLang || "",
      segmentsCount: (v.segments || []).length,
      chars: (v.segments || []).reduce((a, s) => a + (s.text || "").length, 0),
      fetchedAt: v.fetchedAt || "",
      error: v.error || ""
    }));
    if (opts.q) {
      const q = String(opts.q).toLowerCase().trim();
      list = list.filter(
        (v) => v.title.toLowerCase().includes(q) || (v.description || "").toLowerCase().includes(q) || v.id === q
      );
    }
    list.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
    return list.slice(offset, offset + limit);
  }

  stats() {
    const list = [...this.videos.values()];
    return {
      store: "json",
      videos: list.length,
      videosWithTranscript: list.filter((v) => v.hasTranscript).length,
      demoVideos: list.filter((v) => v.sourceKind === "demo").length,
      segments: list.reduce((a, v) => a + (v.segments || []).length, 0),
      chars: list.reduce((a, v) => a + (v.segments || []).reduce((x, s) => x + (s.text || "").length, 0), 0),
      hours: Math.round(list.reduce((a, v) => a + (v.durationS || 0), 0) / 360) / 10,
      docs: this.docs.length,
      dbPath: this.filePath,
      sizeBytes: safeSize(this.filePath),
      updatedAt: ""
    };
  }

  setMeta() {}
  getMeta() {
    return "";
  }
  logEvent(level, event, message) {
    this.logs.unshift({ ts: nowIso(), level, event, message: String(message).slice(0, 4000) });
    this.logs = this.logs.slice(0, 200);
  }
  getLogs(limit = 50) {
    return this.logs.slice(0, limit).map((l, i) => ({ id: i + 1, ...l }));
  }
  saveQuery() {}
  topQueries() {
    return [];
  }
  exportJsonIndex() {
    this.persist();
    return { file: this.filePath, videos: this.videos.size, bytes: safeSize(this.filePath) };
  }
  close() {}
}

/* ==============================================================
 *  المصنع
 * ============================================================== */

let _store = null;

/**
 * يفتح متجر البيانات المناسب.
 * @param {{forceJson?:boolean, dbPath?:string, jsonPath?:string, reload?:boolean}} opts
 */
function openStore(opts = {}) {
  if (_store && !opts.reload && !opts.forceJson) return _store;

  const dbPath = opts.dbPath || config.DB_PATH;
  const jsonPath = opts.jsonPath || config.JSON_INDEX_PATH;
  const forceJson = opts.forceJson || String(process.env.MISHKAT_STORE || "").toLowerCase() === "json";

  if (!forceJson) {
    try {
      _store = new SqliteStore(dbPath);
      return _store;
    } catch (err) {
      // لا يوجد دعم لـ node:sqlite => ننتقل إلى متجر JSON
      if (process.env.MISHKAT_DEBUG) {
        console.warn("[مشكاة] تعذّر استخدام SQLite، سيتم استخدام متجر JSON:", err.message);
      }
    }
  }
  _store = new JsonStore(jsonPath);
  return _store;
}

module.exports = {
  openStore,
  SqliteStore,
  JsonStore,
  formatTime,
  videoLink,
  ftsAnd,
  ftsOr,
  normalizeArabic
};
