#!/usr/bin/env node
"use strict";

/**
 * mishkat/cli.js
 * ---------------------------------------------------------------
 * أداة أوامر «مشكاة»:
 *   node mishkat/cli.js serve                 تشغيل الخادم والواجهة
 *   node mishkat/cli.js ingest [خيارات]       سحب نصوص القناة إلى القاعدة
 *   node mishkat/cli.js ask "سؤال" [خيارات]   سؤال من الطرفية
 *   node mishkat/cli.js search "كلمات"        بحث في النصوص
 *   node mishkat/cli.js stats                 إحصاءات القاعدة
 *   node mishkat/cli.js videos [--q كلمة]     سرد الفيديوهات
 *   node mishkat/cli.js video <id> [--q كلمة] عرض نص فيديو
 *   node mishkat/cli.js add-doc --title ".." --text ".." [--ref ".."] [--url ".."]
 *   node mishkat/cli.js export                نسخة JSON احتياطية
 *   node mishkat/cli.js seed-demo / purge-demo
 *   node mishkat/cli.js doctor                فحص شامل للتشغيل
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const config = require("./lib/config");
const { openStore, formatTime, videoLink } = require("./lib/db");

/* ---------------- تحليل الوسائط ---------------- */

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const C = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  gold: "\u001b[33m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  cyan: "\u001b[36m"
};

const log = (...a) => console.log(...a);
const title = (t) => log(`\n${C.gold}${C.bold}${t}${C.reset}`);

/* ---------------- الأوامر ---------------- */

async function cmdIngest(flags) {
  const { ingestChannel, ingestOneVideo } = require("./lib/ingest");
  const youtube = require("./lib/youtube");
  const store = openStore();
  const limit = flags.limit ? Number(flags.limit) : config.INGEST.maxVideos;
  const force = !!flags.force;

  title(`سحب نصوص القناة ${config.CHANNEL_ID}`);
  log(`${C.dim}المصدر: ${config.YOUTUBE_API_KEY ? "YouTube Data API" : "استخراج مباشر (بدون مفتاح)"}${C.reset}`);
  if (flags.video) {
    log(`فيديو واحد: ${flags.video}`);
    const meta = await youtube.fetchVideoMeta(String(flags.video)).catch(() => null);
    const res = await ingestOneVideo(store, String(flags.video), {
      force: true,
      meta,
      onProgress: (p) => p.message && log(p.message)
    });
    log(res.status === "ok" ? `${C.green}✓ تم${C.reset} — ${res.chunks} مقطع` : `${C.red}✗ ${res.reason}${C.reset}`);
    try {
      store.exportJsonIndex();
    } catch (_) {}
    return;
  }

  const summary = await ingestChannel(store, {
    max: limit,
    force,
    onProgress: (p) => {
      if (p.message) log(p.message);
      else if (p.phase === "listing" && p.count) log(`  … تم سرد ${p.count} فيديو`);
    }
  });

  title("الخلاصة");
  log(`  الفيديوهات المسرودة : ${summary.listed}`);
  log(`  ${C.green}نجح${C.reset}                : ${summary.ok}`);
  log(`  تم تخطيها (موجودة)   : ${summary.skipped}`);
  log(`  ${C.red}فشل${C.reset}                : ${summary.failed}`);
  log(`  المقاطع المفهرسة     : ${summary.chunks}`);
  log(`  عدد الأحرف           : ${summary.chars}`);
  if (summary.failures.length) {
    log(`\n${C.dim}بعض الفيديوهات بدون ترجمة متاحة (طبيعي إن لم تُفعّل الترجمة عليها):${C.reset}`);
    summary.failures.slice(0, 10).forEach((f) => log(`  - ${f.title || f.id}: ${String(f.reason).slice(0, 90)}`));
  }
  return summary;
}

async function cmdAsk(question, flags) {
  const store = openStore();
  const retrieve = require("./lib/retrieve");
  const ai = require("./lib/ai");
  if (!question) {
    log(`${C.red}اكتب السؤال:${C.reset} node mishkat/cli.js ask "ما حكم صلاة الجماعة؟"`);
    process.exit(1);
  }
  const mode = ["strict", "balanced", "open"].includes(flags.mode) ? flags.mode : config.APP.defaultMode;
  const retrieval = retrieve.search(store, question, {});
  const provider = ai.providerInfo();

  title(`السؤال: ${question}`);
  log(
    `${C.dim}التصنيف: ${retrieval.classification.primary.label} | تغطية النصوص: ${Math.round(
      retrieval.coverage * 100
    )}% | المحرك: ${provider.enabled ? provider.label : "استخراجي"} | الوضع: ${mode}${C.reset}`
  );

  const channelTitle = store.getMeta ? store.getMeta("channelTitle") || "" : "";
  const result = await ai.answerQuestion({
    question,
    retrieval,
    mode,
    channelTitle,
    onToken: (t) => process.stdout.write(t)
  });
  if (!result.answer.endsWith("\n")) log("");

  title("المصادر");
  retrieval.results.forEach((r, i) => {
    log(`  [${i + 1}] ${r.title}`);
    log(`      ${C.cyan}${r.link}${C.reset}  ${C.dim}(التوقيت ${r.time} — الصلة ${r.score})${C.reset}`);
  });
  if (result.usedFallback && result.error) log(`\n${C.dim}تنبيه: تعذّر المحرك الذكي (${result.error}) فتم استخدام المحرك الاستخراجي.${C.reset}`);
}

async function cmdSearch(q, flags) {
  const store = openStore();
  const retrieve = require("./lib/retrieve");
  if (!q) {
    log("اكتب كلمات البحث.");
    process.exit(1);
  }
  const res = retrieve.search(store, q, { topK: Number(flags.topK || 10) });
  title(`نتائج البحث عن: ${q}`);
  if (!res.results.length) {
    log(`${C.red}لا نتائج.${C.reset} القاعدة تحتوي ${store.stats().segments} مقطع.`);
    return;
  }
  res.results.forEach((r, i) => {
    log(`${C.gold}[${i + 1}]${C.reset} ${C.bold}${r.title}${C.reset} ${C.dim}(${r.time} — صلة ${r.score})${C.reset}`);
    log(`    ${r.text.slice(0, 400)}${r.text.length > 400 ? "…" : ""}`);
    log(`    ${C.cyan}${r.link}${C.reset}\n`);
  });
}

function cmdStats() {
  const store = openStore();
  const stats = store.stats();
  title("إحصاءات قاعدة «مشكاة»");
  log(`  المتجر         : ${stats.store} (${stats.dbPath})`);
  log(`  الفيديوهات     : ${stats.videos}  (بترجمة: ${stats.videosWithTranscript})`);
  log(`  المقاطع النصية : ${stats.segments}`);
  log(`  عدد الأحرف     : ${stats.chars}  ≈ ${Math.round(stats.chars / 5)} كلمة`);
  log(`  مدة المصدر     : ${stats.hours} ساعة`);
  log(`  مستندات مرجعية : ${stats.docs}`);
  log(`  حجم القاعدة    : ${(stats.sizeBytes / 1024 / 1024).toFixed(2)} ميجابايت`);
  if (stats.demoVideos) log(`  ${C.gold}بيانات تجريبية: ${stats.demoVideos} فيديو (احذفها بأمر purge-demo)${C.reset}`);
  log(`  آخر تحديث      : ${stats.updatedAt || "—"}`);
}

function cmdVideos(flags) {
  const store = openStore();
  const videos = store.listVideos({ q: flags.q || "", limit: Number(flags.limit || 30) });
  title(`الفيديوهات (${videos.length})`);
  videos.forEach((v, i) => {
    const badge = v.sourceKind === "demo" ? `${C.gold}[تجريبي]${C.reset} ` : "";
    log(`${i + 1}. ${badge}${v.title}`);
    log(`   ${C.cyan}${v.url}${C.reset} ${C.dim}${v.segmentsCount} مقطع | ${Math.round(v.chars / 1000)}k حرف${v.error ? ` | ${v.error}` : ""}${C.reset}`);
  });
}

function cmdVideo(id, flags) {
  const store = openStore();
  const retrieve = require("./lib/retrieve");
  const data = flags.q ? retrieve.searchInVideo(store, id, flags.q) : retrieve.getVideoTimeline(store, id);
  if (!data) {
    log(`${C.red}الفيديو غير موجود في القاعدة.${C.reset}`);
    process.exit(1);
  }
  title(`${data.video.title}`);
  log(`${C.cyan}${data.video.url}${C.reset}\n`);
  data.segments.forEach((s) => {
    log(`${C.dim}[${s.time}]${C.reset} ${s.text}`);
  });
}

function cmdAddDoc(flags) {
  const store = openStore();
  if (!flags.title || !flags.text) {
    log('الاستخدام: add-doc --title "العنوان" --text "النص" [--ref "المرجع"] [--url "الرابط"]');
    process.exit(1);
  }
  const id = store.addDoc({
    title: String(flags.title),
    text: String(flags.text),
    ref: flags.ref ? String(flags.ref) : "",
    url: flags.url ? String(flags.url) : "",
    kind: "reference"
  });
  log(`${C.green}✓ تمت إضافة المستند رقم ${id}${C.reset}`);
  try {
    store.exportJsonIndex();
  } catch (_) {}
}

function cmdExport(flags) {
  const store = openStore();
  const file = flags.out ? String(flags.out) : path.join(config.DATA_DIR, "index.json");
  const res = store.exportJsonIndex(file);
  log(`${C.green}✓ تم التصدير${C.reset} → ${res.file}`);
  log(`  ${res.videos} فيديو — ${(res.bytes / 1024 / 1024).toFixed(2)} ميجابايت`);
}

function cmdSeedDemo() {
  const { seedDemo } = require("./lib/demo");
  const store = openStore();
  const res = seedDemo(store);
  try {
    store.exportJsonIndex();
  } catch (_) {}
  log(`${C.green}✓ تمت إضافة ${res.videos} فيديو تجريبي و${res.chunks} مقطع و${res.docs} مستند.${C.reset}`);
  log(`${C.dim}للحذف: node mishkat/cli.js purge-demo${C.reset}`);
}

function cmdPurgeDemo() {
  const store = openStore();
  const removed = store.deleteDemoData();
  try {
    store.exportJsonIndex();
  } catch (_) {}
  log(`${C.green}✓ تم حذف ${removed} فيديو تجريبي والمستندات التجريبية.${C.reset}`);
}

async function cmdImport(flags) {
  const importer = require("./lib/import");
  const store = openStore();
  const replace = flags["no-replace"] ? false : true;
  const fetchMeta = flags["no-meta"] ? false : true;

  // (أ) من مجلد
  if (flags.dir) {
    title(`استيراد ملفات الترجمة من: ${flags.dir}`);
    const summary = await importer.importDirectory(store, String(flags.dir), {
      replace,
      fetchMeta,
      onProgress: (p) => {
        if (p.status === "ok") log(`  ${C.green}✓${C.reset} ${p.file} → ${p.chunks} مقطع (${p.videoId})`);
        else if (p.status === "skipped") log(`  ${C.gold}↺${C.reset} ${p.file} — ${p.reason || "تم تخطيه"}`);
        else log(`  ${C.red}✗${C.reset} ${p.file} — ${p.reason}`);
      }
    });
    title("الخلاصة");
    log(`  نجح: ${summary.ok} | فشل: ${summary.failed} | تُخطّي: ${summary.skipped}`);
    log(`  المقاطع المضافة: ${summary.chunks} — الأحرف: ${summary.chars}`);
    if (summary.failures.length) {
      log(`\n${C.dim}ملفات لم تُستورد:${C.reset}`);
      summary.failures.slice(0, 10).forEach((f) => log(`  - ${f.file}: ${f.reason}`));
    }
    log(`\n${C.dim}تلميح: سمِّ الملف بمعرّف الفيديو، مثل: vidSalah0001.srt${C.reset}`);
    return;
  }

  // (ب) نص مكتوب أو ملف
  const videoId = flags.video || flags.url || "";
  let content = flags.text ? String(flags.text) : "";
  if (!content && flags.file) {
    const file = path.resolve(String(flags.file));
    if (!fs.existsSync(file)) {
      log(`${C.red}الملف غير موجود:${C.reset} ${file}`);
      process.exit(1);
    }
    content = fs.readFileSync(file, "utf8");
    flags.filename = path.basename(file);
  }
  if (!videoId || !content) {
    log(`${C.red}الاستخدام:${C.reset}
  node mishkat/cli.js import --video <ID> --file <ملف.srt|vtt|txt> [--replace] [--no-meta]
  node mishkat/cli.js import --video <ID> --text "نص الدرس…"
  node mishkat/cli.js import --dir <مجلد ملفات الترجمة>`);
    process.exit(1);
  }

  title(`إدخال النص للفيديو: ${videoId}`);
  try {
    const res = await importer.importTranscript(store, videoId, content, {
      format: flags.format || "auto",
      filename: flags.filename || "",
      replace,
      fetchMeta,
      title: flags.title || "",
      durationS: flags.duration ? Number(flags.duration) : undefined
    });
    log(`${C.green}✓ تم الإدخال${C.reset}`);
    log(`  العنوان       : ${res.title}`);
    log(`  الصيغة        : ${res.format}`);
    log(`  المقاطع       : ${res.chunks} (من ${res.segments} سطرًا)`);
    log(`  الأحرف        : ${res.chars}`);
    if (res.channelVerified === false) log(`  ${C.gold}⚠ ${res.warnings[0]}${C.reset}`);
    res.warnings.filter((w) => !w.includes("ليست من القناة")).forEach((w) => log(`  ${C.gold}⚠ ${w}${C.reset}`));
    log(`  الرابط        : ${C.cyan}https://www.youtube.com/watch?v=${res.videoId}${C.reset}`);
  } catch (err) {
    log(`${C.red}✗ تعذّر الإدخال:${C.reset} ${err.message}`);
    process.exit(1);
  }
}

function cmdMissing(flags) {
  const store = openStore();
  const report = require("./lib/import").missingTranscripts(store, { limit: Number(flags.limit || 50) });
  title("الفيديوهات التي لا يوجد لها نص");
  log(`  إجمالي الفيديوهات : ${report.total}`);
  log(`  ${C.green}مفهرسة بنص${C.reset}       : ${report.indexed}`);
  log(`  ${C.gold}تحتاج نصًا${C.reset}        : ${report.missing}`);
  if (report.videos.length) {
    log("");
    report.videos.forEach((v, i) => {
      log(`${i + 1}. ${v.title}`);
      log(`   ${C.cyan}${v.url}${C.reset} ${C.dim}— ${v.reason}${C.reset}`);
    });
    log(`\n${C.dim}${report.hint}${C.reset}`);
  }
}

async function cmdDoctor() {
  const checks = [];
  /** level: ok | warn | fail */
  const add = (name, level, detail = "") =>
    checks.push({ name, level: level === true ? "ok" : level === false ? "fail" : level, detail });

  // 1) الإصدار
  const major = Number(process.versions.node.split(".")[0]);
  add("إصدار Node.js", major >= 18 ? "ok" : "fail", `${process.version}${major < 18 ? " (مطلوب 18 أو أحدث)" : ""}`);

  // 2) الاتصال بالشبكة/youtube
  try {
    await require("./lib/youtube").httpText(`${config.YT_BASE}/robots.txt`, { retries: 0, timeoutMs: 8000 });
    add("الاتصال بـ youtube.com", "ok");
  } catch (err) {
    add(
      "الاتصال بـ youtube.com",
      "warn",
      `${err.message} — سحب النصوص يحتاج اتصالًا مباشرًا؛ شغّل npm run ingest على جهازك أو خادمك.`
    );
  }

  // 3) قاعدة البيانات
  try {
    const store = openStore();
    const stats = store.stats();
    add(
      `قاعدة البيانات (${stats.store})`,
      "ok",
      `${stats.videos} فيديو / ${stats.segments} مقطع — ${(stats.sizeBytes / 1024 / 1024).toFixed(2)}MB`
    );
    add("هل القاعدة مفهرسة؟", stats.segments > 0 ? "ok" : "warn", stats.segments ? "جاهزة للأسئلة" : "شغّل: npm run ingest");
    if (stats.demoVideos) add("بيانات تجريبية", "warn", `${stats.demoVideos} فيديو تجريبي — احذفها بـ npm run purge-demo`);
  } catch (err) {
    add("قاعدة البيانات", "fail", err.message);
  }

  // 4) المفاتيح
  const ai = require("./lib/ai").providerInfo();
  add(
    "محرك الذكاء الاصطناعي",
    ai.enabled ? "ok" : "warn",
    ai.enabled ? `${ai.label} — ${ai.model}` : "لا يوجد مفتاح API؛ سيعمل المحرك الاستخراجي (اختياري)"
  );
  add(
    "مفتاح YouTube API (اختياري)",
    config.YOUTUBE_API_KEY ? "ok" : "warn",
    config.YOUTUBE_API_KEY ? "موجود" : "غير موجود (سيُستخدم الاستخراج المباشر)"
  );
  add(
    "حماية نقاط التغذية",
    config.SERVER.adminToken ? "ok" : "warn",
    config.SERVER.adminToken ? "مضبوطة" : "MISHKAT_ADMIN_TOKEN غير مضبوط (مناسب للتطوير المحلي فقط)"
  );

  // 5) ملفات الواجهة
  const uiFiles = ["index.html", "app.js", "style.css"].map((f) => path.join(config.SERVER.publicDir, f));
  add("ملفات الواجهة", uiFiles.every((f) => fs.existsSync(f)) ? "ok" : "fail", config.SERVER.publicDir);

  // 6) صحة الوحدات
  for (const mod of ["./lib/arabic", "./lib/db", "./lib/retrieve", "./lib/ai", "./lib/text", "./server"]) {
    try {
      require(mod);
      add(`وحدة ${mod}`, "ok");
    } catch (err) {
      add(`وحدة ${mod}`, "fail", err.message);
    }
  }

  title("فحص التشغيل (doctor)");
  const marks = { ok: `${C.green}✔${C.reset}`, warn: `${C.gold}⚠${C.reset}`, fail: `${C.red}✘${C.reset}` };
  for (const c of checks) {
    log(`  ${marks[c.level] || marks.ok} ${c.name}${c.detail ? ` ${C.dim}— ${c.detail}${C.reset}` : ""}`);
  }
  const failed = checks.filter((c) => c.level === "fail").length;
  const warned = checks.filter((c) => c.level === "warn").length;
  if (failed) log(`\n${C.red}${failed} خطأ يجب إصلاحه.${C.reset}${warned ? ` (و${warned} تنبيه اختياري)` : ""}`);
  else if (warned) log(`\n${C.green}لا أخطاء.${C.reset} ${C.gold}${warned} تنبيه اختياري (المفاتيح/الشبكة).${C.reset}`);
  else log(`\n${C.green}كل الفحوص ناجحة.${C.reset}`);
}

/* ---------------- التوجيه ---------------- */

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const cmd = positional[0] || "serve";
  const arg = positional.slice(1).join(" ").trim();

  switch (cmd) {
    case "serve":
    case "start": {
      const { start } = require("./server");
      start();
      break;
    }
    case "ingest":
      await cmdIngest(flags);
      break;
    case "import":
    case "add-transcript":
      await cmdImport(flags);
      break;
    case "missing":
      cmdMissing(flags);
      break;
    case "ask":
      await cmdAsk(arg, flags);
      break;
    case "search":
      await cmdSearch(arg, flags);
      break;
    case "stats":
      cmdStats();
      break;
    case "videos":
      cmdVideos(flags);
      break;
    case "video":
      cmdVideo(arg, flags);
      break;
    case "add-doc":
      cmdAddDoc(flags);
      break;
    case "export":
      cmdExport(flags);
      break;
    case "seed-demo":
      cmdSeedDemo();
      break;
    case "purge-demo":
      cmdPurgeDemo();
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "help":
    case "--help":
    case "-h":
      title("أوامر «مشكاة»");
      log(`  serve                                  تشغيل الواجهة على المنفذ ${config.SERVER.port}
  ingest [--limit N] [--force] [--video ID]   سحب نصوص القناة
  ask "سؤال" [--mode strict|balanced|open]   سؤال من الطرفية
  search "كلمات" [--topK N]                 بحث في المقاطع
  stats                                     إحصاءات
  videos [--q كلمة] [--limit N]             سرد الفيديوهات
  video <id> [--q كلمة]                     عرض نص فيديو
  import --video ID --file subs.srt         إدخال نص/ترجمة لفيديو
  import --video ID --text "نص الدرس"       إدخال نص ملصوق مباشرة
  import --dir ./subtitles                  استيراد مجلد ملفات ترجمة
  missing [--limit N]                       الفيديوهات التي تحتاج نصًا
  add-doc --title .. --text ..              إضافة مستند مرجعي
  export [--out ملف]                        تصدير نسخة JSON
  seed-demo | purge-demo                    بيانات تجريبية
  doctor                                    فحص شامل`);
      break;
    default:
      log(`${C.red}أمر غير معروف: ${cmd}${C.reset} — استخدم: node mishkat/cli.js help`);
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`${C.red}خطأ:${C.reset} ${err.message}`);
    if (process.env.MISHKAT_DEBUG) console.error(err);
    process.exit(1);
  });
}

module.exports = { main, parseArgs };
