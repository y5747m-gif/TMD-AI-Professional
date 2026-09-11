"use strict";

/**
 * mishkat/scripts/restore-real-data.js
 * ---------------------------------------------------------------
 * استعادة «بيانات القناة الحقيقية» وتنفيذ العملية كاملة بأمر واحد:
 *
 *   1) فحص مسبق للاتصال بـ youtube.com (يفشل مبكرًا برسالة واضحة إن كان المحجوب)
 *   2) حذف البيانات التجريبية من قاعدة «مشكاة»
 *   3) سحب فيديوهات القناة ونصوصها الحقيقية            (npm run ingest)
 *   4) تصدير النسخة المفهرسة mishkat/data/index.json    (npm run export)
 *   5) تشغيل الاختبارات                                  (npm test)
 *   6) التزام بالرسالة: «مشكاة: بيانات القناة الحقيقية»
 *   7) الدفع إلى origin/main
 *   8) التحقق من نجاح الدفع (مطابقة sha الرئيسية البعيدة مع المحلية)
 *
 * الاستخدام:
 *   node mishkat/scripts/restore-real-data.js              # العملية كاملة
 *   node mishkat/scripts/restore-real-data.js --limit 10   # تجربة على 10 فيديوهات أولًا
 *   node mishkat/scripts/restore-real-data.js --no-push    # بدون دفع
 *   node mishkat/scripts/restore-real-data.js --no-test    # بدون اختبارات
 *   node mishkat/scripts/restore-real-data.js --force      # إعادة سحب كل الفيديوهات
 *
 * ملاحظة: يجب تشغيله على جهاز/خادم يصل إلى youtube.com مباشرة
 * (بيئات CI المعزولة أو الحاويات بلا اتصال خارجي لن تنجح فيها الخطوة 1).
 * ---------------------------------------------------------------
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const config = require("../lib/config");
const { openStore } = require("../lib/db");

/* ---------------- أدوات مساعدة ---------------- */

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

const log = (...a) => console.log(...a);
const step = (n, t) => log(`\n${C.gold(C.bold(`[${n}/8] ${t}`))}`);
const die = (msg) => {
  log(`\n${C.red(`✗ ${msg}`)}`);
  process.exit(1);
};

const COMMIT_MESSAGE = "مشكاة: بيانات القناة الحقيقية";

/** قراءة الأعلام البسيطة --flag=value / --flag */
function parseFlags(argv) {
  const flags = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    }
  }
  return flags;
}

const flags = parseFlags(process.argv);

/** تنفيذ أمر git وإرجاع النتيجة */
function git(args, opts = {}) {
  const res = spawnSync("git", args, { encoding: "utf8" });
  if (res.status !== 0 && !opts.mayFail) {
    die(`فشل الأمر git ${args.join(" ")}:\n${(res.stderr || res.stdout || "").trim()}`);
  }
  return { ok: res.status === 0, out: (res.stdout || "").trim(), err: (res.stderr || "").trim() };
}

/* ---------------- [1/8] فحص الاتصال ---------------- */

async function precheck() {
  step(1, "فحص الاتصال بـ youtube.com");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://www.youtube.com/", {
      method: "HEAD",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 mishkat-restore" }
    });
    log(C.green(`✔ الاتصال متاح (HTTP ${res.status})`));
  } catch (e) {
    die(
      "لا يمكن الوصول إلى youtube.com من هذه البيئة. " +
        "شغّل السكربت على جهازك أو خادمك حيث الاتصال المباشر متاح.\n" +
        C.dim(`السبب التقني: ${e && e.message ? e.message : e}`)
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- [2..4] البيانات ---------------- */

async function buildData() {
  const store = openStore();

  step(2, "حذف البيانات التجريبية");
  try {
    const removed = store.deleteDemoData();
    log(C.green(`✔ تم حذف ${removed} عنصر تجريبي (إن وُجد)`));
  } catch (e) {
    log(C.dim(`— لا توجد بيانات تجريبية (${e && e.message ? e.message : e})`));
  }

  step(3, `سحب نصوص القناة الحقيقية ${config.CHANNEL_ID}`);
  const { ingestChannel } = require("../lib/ingest");
  const summary = await ingestChannel(store, {
    max: flags.limit ? Number(flags.limit) : config.INGEST.maxVideos,
    force: !!flags.force,
    onProgress: (p) => {
      if (p.message) log(`  ${C.dim(p.message)}`);
      else if (p.phase === "listing" && p.count) log(`  ${C.dim(`… تم سرد ${p.count} فيديو`)}`);
    }
  });
  log(
    `  الفيديوهات: ${summary.listed} | نجح: ${C.green(summary.ok)} | تخطي: ${summary.skipped} | فشل: ${C.red(summary.failed)} | مقاطع: ${summary.chunks}`
  );
  if (summary.ok === 0) die("لم يُسحب أي فيديو — تحقق من القناة أو من ترجمات الفيديوهات.");

  step(4, "تصدير النسخة المفهرسة index.json");
  const exported = store.exportJsonIndex();
  const mb = (exported.bytes / 1024 / 1024).toFixed(2);
  log(C.green(`✔ ${exported.file} — ${exported.videos} فيديو — ${mb} ميجابايت`));

  try {
    store.close && store.close();
  } catch (_) {}
  return summary;
}

/* ---------------- [5] الاختبارات ---------------- */

function runTests() {
  if (flags["no-test"]) {
    log(C.dim("\n— تم تخطي الاختبارات (--no-test)"));
    return;
  }
  step(5, "تشغيل الاختبارات");
  const res = spawnSync(process.execPath, [path.join(__dirname, "test.js")], {
    stdio: "inherit",
    env: { ...process.env, MISHKAT_DEBUG: "" }
  });
  if (res.status !== 0) log(C.gold("⚠ فشلت بعض الاختبارات — راجع الناتج أعلاه (لن يمنع الالتزام)"));
  else log(C.green("✔ جميع الاختبارات ناجحة"));
}

/* ---------------- [6..8] git: التزام ثم دفع ثم تحقق ---------------- */

function commitAndPush() {
  step(6, "الالتزام بالتغييرات");

  git(["rev-parse", "--is-inside-work-tree"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  const before = git(["rev-parse", "HEAD"]).out;

  git(["add", "--", path.join("mishkat", "data")]);
  const staged = git(["diff", "--cached", "--name-only"]).out;
  if (!staged) {
    log(C.dim("— لا توجد تغييرات جديدة على mishkat/data (البيانات الحالية مطابقة لآخر التزام)"));
    return before;
  }
  log(`${C.dim("ملفات متغيرة:")}\n${staged.split("\n").map((s) => `  - ${s}`).join("\n")}`);
  if (flags["no-commit"]) {
    log(C.dim("— تم تخطي الالتزام (--no-commit) — التغييرات في منطقة الانتظار فقط"));
    return before;
  }
  git(["commit", "-m", COMMIT_MESSAGE]);
  const sha = git(["rev-parse", "HEAD"]).out;
  log(C.green(`✔ التزم ${sha.slice(0, 7)} — «${COMMIT_MESSAGE}»`));
  return sha;
}

function pushAndVerify(shaToPush) {
  if (flags["no-push"]) {
    log(C.dim("\n— تم تخطي الدفع (--no-push)"));
    return;
  }

  step(7, "الدفع إلى origin/main");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  const spec = branch === "main" ? "main" : `HEAD:main`;
  const pushed = git(["push", "origin", spec], { mayFail: true });
  if (!pushed.ok) {
    die(
      `فشل الدفع إلى origin/main:\n${pushed.err || pushed.out}\n` +
        C.dim("جرّب: git pull --rebase origin main ثم أعد تشغيل السكربت.")
    );
  }
  log(C.green(`✔ تم الدفع (${spec})`));

  step(8, "التحقق من نجاح الدفع");
  const remote = git(["ls-remote", "origin", "refs/heads/main"]).out.split(/\s+/)[0];
  const local = git(["rev-parse", "HEAD"]).out;
  if (remote && remote === local) {
    log(C.green(`✔ مؤكد: origin/main = ${remote.slice(0, 7)} = الالتزام المحلي`));
  } else {
    die(`عدم تطابق بعد الدفع!\n  origin/main: ${remote}\n  محلي (HEAD): ${local}`);
  }
}

/* ---------------- الرئيسية ---------------- */

(async () => {
  log(C.bold("\n=== مشكاة — استعادة بيانات القناة الحقيقية ==="));
  log(C.dim(`المستودع: ${(() => {
    const top = git(["rev-parse", "--show-toplevel"], { mayFail: true });
    return top.ok ? top.out : process.cwd();
  })()}`));

  await precheck();
  await buildData();
  runTests();
  const sha = commitAndPush();
  pushAndVerify(sha);
  log(C.bold(C.green("\n✓ اكتملت العملية بنجاح.\n")));
})().catch((e) => die(e && e.stack ? e.stack : String(e)));
