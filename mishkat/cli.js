#!/usr/bin/env node
"use strict";

/**
 * mishkat/cli.js
 * ---------------------------------------------------------------
 * سطر أوامر «مشكاة»:
 *   ask        سؤال → ردّ منقول من إسلام ويب + روابط فيديوهات
 *   search     بحث في إسلام ويب فقط
 *   videos     سرد لائحة روابط الفيديوهات
 *   video:add  إضافة فيديو (عنوان + رابط)
 *   video:rm   حذف فيديو
 *   video:import  استيراد لائحة روابط من ملف/نص
 *   stats      إحصاءات اللائحة والذاكرة المؤقتة
 *   doctor     فحص شامل (مع --probe لفحص الاتصال بإسلام ويب)
 *   cache:clear  تفريغ الذاكرة المؤقتة لصفحات إسلام ويب
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const config = require("./lib/config");
const answerLib = require("./lib/answer");
const islamweb = require("./lib/islamweb");
const videosLib = require("./lib/videos");
const ai = require("./lib/ai");

/* ==============================================================
 *  قراءة الوسائط
 * ============================================================== */

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq > 0) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          args[key] = next;
          i += 1;
        } else {
          args[key] = true;
        }
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

const argv = process.argv.slice(2);
const command = (argv.shift() || "help").toLowerCase();
const args = parseArgs(argv);

function line(char = "─", n = 62) {
  return char.repeat(n);
}

function title(text) {
  return `\n${text}\n${line()}`;
}

/* ==============================================================
 *  الأوامر
 * ============================================================== */

async function cmdAsk() {
  const question = args._.join(" ").trim() || args.q;
  if (!question) {
    console.error("اكتب السؤال: npm run ask -- \"ما حكم صلاة الجماعة؟\"");
    process.exit(1);
  }
  const mode = answerLib.normalizeMode(args.mode || config.APP.defaultMode);
  process.stdout.write(`\n⏳ أسأل موقع إسلام ويب عن: ${question}\n`);

  const result = await answerLib.answer({
    question,
    mode,
    onMeta: (meta) => {
      if (meta.sources.length) {
        process.stdout.write(
          `   ↳ ${meta.sources.length} نتيجة، أعلاها: ${meta.sources[0].title.slice(0, 60)}…\n`
        );
      } else {
        process.stdout.write("   ↳ لم تُرجع صفحة البحث نتائج مطابقة.\n");
      }
      if (meta.videos.length) process.stdout.write(`   ↳ ${meta.videos.length} فيديو مرتبط بالسؤال.\n`);
    }
  });

  console.log(title(result.answer));

  if (result.videos.length) {
    console.log(title("روابط الفيديوهات المتعلقة بالسؤال"));
    for (const video of result.videos) console.log(`- ${video.title}\n  ${video.url}`);
  }

  if (result.notes.length) {
    console.log(title("ملاحظات"));
    for (const note of result.notes) console.log(`- ${note}`);
  }
  console.log(
    `\nالمصدر: إسلام ويب — المحرك: ${result.provider}${result.usedFallback ? " (احتياطي)" : ""} — ${result.timing.ms}م.ث\n`
  );
}

async function cmdSearch() {
  const query = args._.join(" ").trim() || args.q;
  if (!query) {
    console.error("اكتب كلمات البحث: npm run search -- \"زكاة الفطر\"");
    process.exit(1);
  }
  const result = await answerLib.search(query, { limit: Number(args.limit || config.ISLAMWEB.topK) });

  console.log(title(`نتائج إسلام ويب عن: ${query}`));
  if (!result.sources.length) {
    console.log("لا توجد نتائج.");
  } else {
    result.sources.forEach((source, i) => {
      console.log(
        `${i + 1}) [${source.kindLabel}] ${source.title}\n   ${source.url}\n   ${
          source.snippet ? `${source.snippet.slice(0, 160)}…` : ""
        } (درجة الملاءمة: ${source.score})\n`
      );
    });
  }

  if (result.videos.length) {
    console.log(title("روابط فيديوهات مرتبطة"));
    for (const video of result.videos) console.log(`- ${video.title} — ${video.url}`);
  }
}

function cmdVideos() {
  const result = videosLib.list({ q: String(args.q || "").trim(), limit: Number(args.limit || 0) });
  console.log(title(`لائحة الفيديوهات (${result.total} رابط)`));
  if (!result.items.length) {
    console.log("اللائحة فارغة. أضِف روابط بالأمر:");
    console.log('  node mishkat/cli.js video:add --url "https://www.youtube.com/watch?v=..." --title "عنوان الدرس"');
    return;
  }
  for (const video of result.items) {
    console.log(`• ${video.title}\n  ${video.url}${video.tags.length ? `\n  الوسوم: ${video.tags.join("، ")}` : ""}`);
  }
  console.log(`\nالملف: ${videosLib.filePath()}`);
}

async function cmdVideoAdd() {
  const url = String(args.url || args._.join(" ") || "").trim();
  if (!url) {
    console.error('الاستخدام: node mishkat/cli.js video:add --url "رابط الفيديو" [--title "العنوان"] [--tags "فقه، صلاة"]');
    process.exit(1);
  }
  const result = await videosLib.add({
    url,
    title: args.title || "",
    description: args.desc || args.description || "",
    tags: args.tags ? String(args.tags).split(/[,،|]/).map((t) => t.trim()) : [],
    publishedAt: args.date || ""
  });
  console.log(`${result.updated ? "↻ حُدِّث" : "✓ أُضيف"}: ${result.video.title}\n  ${result.video.url}`);
  console.log(`إجمالي اللائحة: ${result.total}`);
}

function cmdVideoRemove() {
  const id = String(args.id || args.url || "").trim();
  if (!id) {
    console.error("الاستخدام: node mishkat/cli.js video:rm --id <videoId|الرابط>");
    process.exit(1);
  }
  const result = videosLib.remove(id);
  console.log(result.removed ? `✓ حُذف — المتبقي: ${result.total}` : `لم يُوجد في اللائحة — الإجمالي: ${result.total}`);
}

function cmdVideoImport() {
  const file = args.file;
  const raw = file ? fs.readFileSync(path.resolve(String(file)), "utf8") : String(args.text || "");
  if (!raw.trim()) {
    console.error("الاستخدام: node mishkat/cli.js video:import --file videos.txt [--replace]");
    process.exit(1);
  }
  const result = videosLib.importList(raw, { replace: !!args.replace });
  console.log(`✓ أُضيف: ${result.added} — حُدِّث: ${result.updated} — الإجمالي: ${result.total}`);
}

function cmdStats() {
  const stats = videosLib.stats();
  const cache = islamweb.cacheStats();
  const provider = ai.providerInfo();
  console.log(title("إحصاءات مشكاة"));
  console.log(`مصدر الردود : إسلام ويب (${config.ISLAMWEB.base}) — ${config.ISLAMWEB.enabled ? "مُفعَّل" : "معطّل"}`);
  console.log(`روابط الفيديوهات: ${stats.total} (${stats.withTags} موسومة)`);
  console.log(`ملف اللائحة : ${stats.file}${stats.exists ? "" : " (غير موجود)"}`);
  console.log(`ذاكرة مؤقتة : ${cache.entries} صفحة — ${cache.dir}`);
  console.log(`المحرك الذكي: ${provider.label}${provider.enabled ? ` (${provider.model})` : ""}`);
  console.log("نصوص الفيديوهات: لا تُخزَّن ولا تُعرض — روابط فقط.");
}

async function cmdDoctor() {
  const checks = [];
  const add = (name, level, detail = "") => checks.push({ name, level, detail });

  add("إصدار Node.js", "ok", process.version);
  const stats = videosLib.stats();
  add(
    "لائحة الفيديوهات",
    stats.total ? "ok" : "warn",
    stats.total ? `${stats.total} رابط — ${stats.file}` : "فارغة: أضِف روابط بالأمر video:add"
  );
  add(
    "موصّل إسلام ويب",
    config.ISLAMWEB.enabled ? "ok" : "warn",
    `${config.ISLAMWEB.base} — الوضع: ${config.ISLAMWEB.mode}`
  );
  const provider = ai.providerInfo();
  add(
    "محرك الذكاء الاصطناعي",
    provider.enabled ? "ok" : "warn",
    provider.enabled ? `${provider.label} — ${provider.model}` : "بلا مفتاح (يعمل بالمحرك الناقل)"
  );

  if (args.probe) {
    process.stdout.write("\n⏳ أفحص الاتصال بإسلام ويب…\n");
    const probe = await islamweb.selfTest();
    add("الاتصال بإسلام ويب", probe.level, probe.detail);
  } else {
    add("الاتصال بإسلام ويب", "warn", "لم يُفحص (أضف --probe)");
  }

  console.log(title("فحص تشغيل الأداة"));
  for (const check of checks) {
    const icon = check.level === "ok" ? "✓" : check.level === "warn" ? "!" : "✗";
    console.log(`${icon} ${check.name}: ${check.detail}`);
  }
  console.log("");
}

function cmdCacheClear() {
  islamweb.cacheClear();
  console.log("✓ فُرِّغت الذاكرة المؤقتة في هذه العملية.");
}

function cmdHelp() {
  console.log(`
مشكاة — أداة الردود من موقع إسلام ويب + روابط الفيديوهات المتعلقة بالسؤال

الاستخدام:
  node mishkat/cli.js ask "ما حكم صلاة الجماعة؟" [--mode composed|sources]
  node mishkat/cli.js search "زكاة الفطر" [--limit 6]
  node mishkat/cli.js videos [--q كلمة] [--limit 20]
  node mishkat/cli.js video:add --url "رابط" [--title "عنوان"] [--tags "فقه، صلاة"]
  node mishkat/cli.js video:rm --id <videoId>
  node mishkat/cli.js video:import --file videos.txt [--replace]
  node mishkat/cli.js stats
  node mishkat/cli.js doctor [--probe]
  node mishkat/cli.js cache:clear

ملاحظة: لا تُخزَّن نصوص الفيديوهات داخل الأداة إطلاقًا — روابط فقط.
`);
}

/* ==============================================================
 *  التشغيل
 * ============================================================== */

const COMMANDS = {
  ask: cmdAsk,
  search: cmdSearch,
  videos: cmdVideos,
  "video:add": cmdVideoAdd,
  addvideo: cmdVideoAdd,
  "video:rm": cmdVideoRemove,
  "video:remove": cmdVideoRemove,
  "video:import": cmdVideoImport,
  import: cmdVideoImport,
  stats: cmdStats,
  doctor: cmdDoctor,
  "cache:clear": cmdCacheClear,
  clear: cmdCacheClear,
  help: cmdHelp
};

async function main() {
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`أمر غير معروف: ${command}`);
    cmdHelp();
    process.exit(1);
  }
  await handler();
}

main().catch((err) => {
  console.error(`\n✗ خطأ: ${String((err && err.message) || err)}`);
  if (config.str("MISHKAT_DEBUG")) console.error(err);
  process.exit(1);
});
