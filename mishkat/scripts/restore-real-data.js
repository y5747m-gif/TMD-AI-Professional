"use strict";

/**
 * mishkat/scripts/restore-real-data.js
 * ---------------------------------------------------------------
 * استعادة «بيانات القناة الحقيقية» وتنفيذ العملية كاملة بأمر واحد:
 *
 *   1) فحص مسبق للاتصال بـ youtube.com (يفشل مبكرًا برسالة واضحة إن كان محجوبًا)
 *   2) حذف البيانات التجريبية من قاعدة «مشكاة»
 *   3) سحب فيديوهات القناة ونصوصها الحقيقية            (npm run ingest)
 *   4) تصدير النسخة المفهرسة mishkat/data/index.json    (npm run export)
 *   5) تشغيل الاختبارات                                  (npm test)
 *   6) التزام بالرسالة: «مشكاة: بيانات القناة الحقيقية»
 *   7) الدفع إلى origin/main                             (الوضع الافتراضي)
 *   8) التحقق من نجاح الدفع (مطابقة sha الرئيسية البعيدة مع المحلية)
 *
 * وبوضع طلب السحب (--pr) تُستبدل الخطوتان 7-8 بمسار طلب سحب كامل:
 *   7) دفع فرع بيانات مستقل (mishkat/real-data-…)
 *   8) فتح طلب سحب (PR) إلى main عبر gh
 *   9) الدمج (--merge) ثم التحقق من وصول البيانات فعلًا إلى origin/main
 *      بمطابقة بصمة ملف البيانات (blob) لا بصمة الالتزام — لأن الدمج
 *      بطريقة squash يغيّر sha الالتزام ولا يغيّر محتوى الملف.
 *
 * الاستخدام:
 *   node mishkat/scripts/restore-real-data.js              # العملية كاملة (دفع مباشر إلى main)
 *   node mishkat/scripts/restore-real-data.js --pr         # عبر طلب سحب (PR) دون دمج
 *   node mishkat/scripts/restore-real-data.js --pr --merge # عبر PR ثم دمج في main والتحقق
 *   node mishkat/scripts/restore-real-data.js --dry-run    # طباعة الأوامر دون تنفيذ (بلا شبكة ولا التزام)
 *   node mishkat/scripts/restore-real-data.js --limit 10   # تجربة على 10 فيديوهات أولًا
 *   node mishkat/scripts/restore-real-data.js --no-push    # بدون دفع
 *   node mishkat/scripts/restore-real-data.js --no-test    # بدون اختبارات
 *   node mishkat/scripts/restore-real-data.js --force      # إعادة سحب كل الفيديوهات
 *   node mishkat/scripts/restore-real-data.js --branch=اسم # تحديد اسم فرع البيانات
 *   node mishkat/scripts/restore-real-data.js --base=main  # الفرع الهدف لطلب السحب
 *
 * ملاحظة: يجب تشغيله على جهاز/خادم يصل إلى youtube.com مباشرة
 * (بيئات CI المعزولة أو الحاويات بلا اتصال خارجي لن تنجح فيها الخطوة 1).
 * ---------------------------------------------------------------
 */

const { spawnSync } = require("child_process");
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

const COMMIT_MESSAGE = "مشكاة: بيانات القناة الحقيقية";
const DATA_PATH = path.join("mishkat", "data");
const INDEX_REL = path.join("mishkat", "data", "index.json");
/** بصمة بديلة تُطبع في المحاكاة بدل sha الحقيقي */
const DRY_SHA = "DRYRUN";

/** الأعلام الحالية — تُملأ في main() فقط، حتى يبقى الطلب (require) بلا آثار جانبية */
let flags = {};
let TOTAL = 8;

const isDryRun = () => !!flags["dry-run"];

function step(n, t) {
  log(`\n${C.gold(C.bold(`[${n}/${TOTAL}] ${t}`))}`);
}

function die(msg) {
  log(`\n${C.red(`✗ ${msg}`)}`);
  process.exit(1);
}

/** قراءة الأعلام البسيطة --flag=value / --flag */
function parseFlags(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

/* ---------------- تنفيذ الأوامر (git / gh) ---------------- */

/**
 * تنفيذ أمر خارجي. في وضع --dry-run يُطبع الأمر بدل تنفيذه.
 * opts.mayFail: لا يُنهي العملية عند الفشل. opts.label: اسم الأمر في رسائل الخطأ.
 */
function runCmd(cmd, args, opts = {}) {
  if (isDryRun()) {
    log(`  ${C.dim(`$ ${[cmd, ...args].map(quoteArg).join(" ")}`)}`);
    return { ok: true, out: opts.dryOut || "", err: "", dryRun: true };
  }
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0 && !opts.mayFail) {
    const name = opts.label || cmd;
    die(
      `فشل الأمر ${name} ${args.join(" ")}:\n${(res.stderr || res.stdout || "").trim()}` +
        (opts.hint ? `\n${C.dim(opts.hint)}` : "")
    );
  }
  return { ok: res.status === 0, out: (res.stdout || "").trim(), err: (res.stderr || "").trim() };
}

/** تغليف وسيطة تحوي مسافة عند الطباعة */
function quoteArg(a) {
  return /\s/.test(a) ? JSON.stringify(a) : a;
}

const git = (args, opts = {}) => runCmd("git", args, opts);
const gh = (args, opts = {}) =>
  runCmd("gh", args, {
    label: "gh",
    hint: "تحقق من تثبيت GitHub CLI وتسجيل الدخول: gh auth status",
    ...opts
  });

/* ---------------- دوال نقية (قابلة للاختبار) ---------------- */

/** اسم فرع البيانات: ثابت وقابل للتنبؤ من التاريخ (UTC) */
function dataBranchName(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `mishkat/real-data-${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`
  );
}

/** عنوان طلب السحب */
function prTitle() {
  return `${COMMIT_MESSAGE} (${config.CHANNEL_ID})`;
}

/** أعداد آخر عملية سحب — تُملأ في main() وتُدمج في نص طلب السحب */
let runSummary = {};

/** رقم طلب السحب المُنشأ في هذه التشغيل (يُستخدم في التحقق بعد الدمج) */
let lastPrNumber = null;

/** نص طلب السحب — يوثّق مصدر البيانات وأعدادها حتى يراجعها المدمج */
function prBody(s = {}) {
  const info = { ...runSummary, ...s };
  const rows = [
    ["القناة", `[${config.CHANNEL_ID}](${config.CHANNEL_URL})`],
    ["فيديوهات مُسردة", info.listed ?? "—"],
    ["نجح سحبها", info.ok ?? "—"],
    ["تخطّي (موجودة سابقًا)", info.skipped ?? "—"],
    ["فشل", info.failed ?? "—"],
    ["مقاطع نصية (chunks)", info.chunks ?? "—"],
    ["وقت التصدير", info.generatedAt || "—"],
    ["ملف البيانات", `\`${INDEX_REL}\``],
    ["الأمر المولِّد", "`npm run restore -- --pr --merge`"]
  ];
  return [
    "## بيانات القناة الحقيقية",
    "",
    "هذا الطلب يستبدل البيانات التجريبية بنصوص القناة الحقيقية المسحوبة عبر `npm run restore`.",
    "",
    "| البند | القيمة |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "### التحقق المطلوب قبل الدمج",
    `- أن \`sourceKind\` في \`${INDEX_REL}\` ليس \`demo\`.`,
    "- أن `npm test` ناجح.",
    ""
  ].join("\n");
}

/** خطة أوامر مسار طلب السحب — تُطبع في dry-run وتُنفَّذ في الوضع الحقيقي */
function planPrFlow({ branch, base, merge }) {
  const plan = [
    { when: "push", cmd: "git", args: ["push", "-u", "origin", branch] },
    {
      when: "pr",
      cmd: "gh",
      args: ["pr", "create", "--base", base, "--head", branch, "--title", prTitle(), "--body", prBody()]
    }
  ];
  if (merge) plan.push({ when: "merge", cmd: "gh", args: ["pr", "merge", "PR_NUMBER", "--squash"] });
  return plan;
}

/** قراءة رقم/رابط طلب السحب من ناتج gh pr create */
function parsePrRef(stdout = "") {
  const m = String(stdout).match(/(\d+)\s*$/m) || String(stdout).match(/\/pull\/(\d+)/);
  if (!m) return null;
  return { number: Number(m[1]), url: (String(stdout).match(/https:\/\/\S+/) || [""])[0] };
}

/* ---------------- [1] فحص الاتصال ---------------- */

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

/* ---------------- [6] الالتزام ---------------- */

function commitData(branch) {
  step(6, flags.pr ? `الالتزام على فرع البيانات ${branch}` : "الالتزام بالتغييرات");

  git(["rev-parse", "--is-inside-work-tree"]);

  if (flags.pr) {
    const exists = git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { mayFail: true });
    if (exists.ok && exists.out) git(["checkout", branch]);
    else git(["checkout", "-b", branch]);
  }

  git(["add", "--", DATA_PATH]);

  let staged;
  if (isDryRun()) {
    staged = INDEX_REL; // في المحاكاة نفترض تغيّر ملف البيانات
  } else {
    staged = git(["diff", "--cached", "--name-only"]).out;
  }
  if (!staged) {
    log(C.dim(`— لا توجد تغييرات جديدة على ${DATA_PATH} (البيانات الحالية مطابقة لآخر التزام)`));
    return git(["rev-parse", "HEAD"], { mayFail: true }).out || "<sha>";
  }
  log(
    `${C.dim("ملفات متغيرة:")}\n${staged
      .split("\n")
      .map((s) => `  - ${s}`)
      .join("\n")}`
  );
  if (flags["no-commit"]) {
    log(C.dim("— تم تخطي الالتزام (--no-commit) — التغييرات في منطقة الانتظار فقط"));
    return git(["rev-parse", "HEAD"], { mayFail: true }).out || "<sha>";
  }
  git(["commit", "-m", COMMIT_MESSAGE]);
  const sha = git(["rev-parse", "HEAD"], { dryOut: DRY_SHA }).out;
  log(C.green(`✔ التزم ${String(sha).slice(0, 7)} — «${COMMIT_MESSAGE}»`));
  return sha;
}

/* ---------------- [7..8] الدفع المباشر (الوضع الافتراضي) ---------------- */

function pushAndVerify() {
  if (flags["no-push"]) {
    log(C.dim("\n— تم تخطي الدفع (--no-push)"));
    return;
  }

  step(7, "الدفع إلى origin/main");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { dryOut: "main" }).out;
  const spec = branch === "main" ? "main" : "HEAD:main";
  const pushed = git(["push", "origin", spec], { mayFail: true });
  if (!pushed.ok) {
    die(
      `فشل الدفع إلى origin/main:\n${pushed.err || pushed.out}\n` +
        C.dim("جرّب: git pull --rebase origin main ثم أعد تشغيل السكربت.")
    );
  }
  log(C.green(`✔ تم الدفع (${spec})`));

  step(8, "التحقق من نجاح الدفع");
  const remote = git(["ls-remote", "origin", "refs/heads/main"], {
    dryOut: `${DRY_SHA}\trefs/heads/main`
  })
    .out.split(/\s+/)[0];
  const local = git(["rev-parse", "HEAD"], { dryOut: DRY_SHA }).out;
  if (remote && remote === local) {
    log(C.green(`✔ مؤكد: origin/main = ${String(remote).slice(0, 7)} = الالتزام المحلي`));
  } else {
    die(`عدم تطابق بعد الدفع!\n  origin/main: ${remote}\n  محلي (HEAD): ${local}`);
  }
}

/* ---------------- [7..9] مسار طلب السحب (--pr) ---------------- */

function ensureGhAvailable() {
  if (isDryRun()) return;
  const v = gh(["--version"], { mayFail: true });
  if (!v.ok) {
    die("وضع --pr يحتاج GitHub CLI (gh) مثبّتًا ومسجَّل الدخول.\n" + C.dim("ثبّته ثم شغّل: gh auth login"));
  }
}

function prFlow({ branch, base, merge }) {
  ensureGhAvailable();

  step(7, `دفع فرع البيانات ${branch}`);
  if (flags["no-push"]) {
    log(C.dim("— تم تخطي الدفع (--no-push) — لا يمكن فتح PR دون فرع بعيد"));
    return;
  }
  git(["push", "-u", "origin", branch], {
    mayFail: true,
    hint: `تحقق من صلاحية الدفع إلى origin وأن الفرع ${branch} غير محمي.`
  });

  step(8, `فتح طلب سحب إلى ${base}`);
  const created = gh(
    ["pr", "create", "--base", base, "--head", branch, "--title", prTitle(), "--body", prBody()],
    { mayFail: true, dryOut: `https://github.com/${repoSlug()}/pull/PR_NUMBER` }
  );
  if (!created.ok) {
    die(
      `فشل إنشاء طلب السحب:\n${created.err || created.out}\n` +
        C.dim(`أنشئه يدويًا: https://github.com/${repoSlug()}/compare/${base}...${branch}`)
    );
  }
  const ref = parsePrRef(created.out);
  lastPrNumber = ref ? ref.number : null;
  const refLabel = isDryRun() ? "PR_NUMBER" : lastPrNumber ? `#${lastPrNumber}` : "?";
  log(C.green(`✔ ${ref && ref.url ? ref.url : `طلب السحب ${refLabel}`}`));

  if (!merge) {
    log(C.dim(`— لم يُدمج الطلب (أضف --merge للدمج التلقائي في ${base})`));
    return;
  }
  if (!isDryRun() && !lastPrNumber) die("تعذّر تحديد رقم طلب السحب من ناتج gh — ادمجه يدويًا ثم تحقّق.");

  step(9, `دمج الطلب ${refLabel} في ${base}`);
  const merged = gh(["pr", "merge", String(lastPrNumber || "PR_NUMBER"), "--squash"], { mayFail: true });
  if (!merged.ok) die(`فشل الدمج:\n${merged.err || merged.out}`);
  log(C.green(`✔ دُمج الطلب ${refLabel}`));

  verifyMergedData(base);
}

/** اسم المستودع owner/name من عنوان origin */
function repoSlug() {
  const url = git(["config", "--get", "remote.origin.url"], { mayFail: true, dryOut: "origin" }).out;
  const m = String(url).match(/github\.com[:/]([^/]+\/[^/.]+?)(\.git)?$/);
  return m ? m[1] : "owner/repo";
}

/**
 * التحقق بعد الدمج: مطابقة بصمة ملف البيانات (blob) في origin/main مع المحلية.
 * نستخدم البصمة لا sha الالتزام لأن الدمج squash يُنتج التزامًا جديدًا.
 */
function verifyMergedData(base) {
  step(TOTAL, `التحقق من وصول البيانات إلى origin/${base}`);
  git(["fetch", "origin", base]);
  const remoteBlob = git(["rev-parse", `origin/${base}:${INDEX_REL}`], {
    mayFail: true,
    dryOut: `${DRY_SHA}-blob`
  });
  const localBlob = git(["rev-parse", `HEAD:${INDEX_REL}`], { dryOut: `${DRY_SHA}-blob` });
  if (!remoteBlob.ok || !remoteBlob.out) {
    die(`لم يُعثر على ${INDEX_REL} في origin/${base}`);
  }
  if (remoteBlob.out === localBlob.out) {
    log(C.green(`✔ مؤكد: ملف البيانات في origin/${base} مطابق للمحلي (${String(remoteBlob.out).slice(0, 7)})`));
    const prLabel = lastPrNumber ? String(lastPrNumber) : "PR_NUMBER";
    const state = gh(["pr", "view", prLabel, "--json", "state,mergedAt"], { mayFail: true });
    if (state.ok && state.out) log(C.dim(`  حالة الطلب: ${state.out}`));
  } else {
    die(
      `عدم تطابق ملف البيانات بعد الدمج!\n  origin/${base}: ${remoteBlob.out}\n  محلي (HEAD): ${localBlob.out}`
    );
  }
}

/* ---------------- الرئيسية ---------------- */

async function main() {
  flags = parseFlags(process.argv);
  const merge = !!flags.merge;
  TOTAL = flags.pr ? (merge ? 10 : 9) : 8;
  const branch = typeof flags.branch === "string" && flags.branch ? flags.branch : dataBranchName();
  const base = typeof flags.base === "string" && flags.base ? flags.base : "main";

  log(C.bold("\n=== مشكاة — استعادة بيانات القناة الحقيقية ==="));
  log(
    C.dim(`المستودع: ${(() => {
      const top = git(["rev-parse", "--show-toplevel"], { mayFail: true, dryOut: process.cwd() });
      return top.ok ? top.out : process.cwd();
    })()}`)
  );
  log(C.dim(`الوضع: ${flags.pr ? `طلب سحب → ${base}${merge ? " (دمج تلقائي)" : ""}` : `دفع مباشر → ${base}`}`));
  if (isDryRun()) log(C.gold("محاكاة (--dry-run): تُطبع الأوامر فقط، دون شبكة أو التزام أو دفع."));

  if (isDryRun()) {
    log(C.dim("\n— تم تخطي الخطوات 1-5 في المحاكاة (فحص الاتصال، السحب، التصدير، الاختبارات)"));
    commitData(branch);
    if (flags.pr) prFlow({ branch, base, merge });
    else pushAndVerify();
    log(C.bold(C.green("\n✓ انتهت المحاكاة — الأوامر أعلاه هي ما سيُنفَّذ حرفيًا.\n")));
    return;
  }

  await precheck();
  const summary = await buildData();
  runTests();

  // تُمرَّر الأعداد إلى نص طلب السحب
  runSummary = {
    listed: summary.listed,
    ok: summary.ok,
    skipped: summary.skipped,
    failed: summary.failed,
    chunks: summary.chunks,
    generatedAt: new Date().toISOString()
  };

  const sha = commitData(branch);
  if (flags.pr) prFlow({ branch, base, merge });
  else pushAndVerify();
  log(C.bold(C.green(`\n✓ اكتملت العملية بنجاح (${String(sha).slice(0, 7)}).\n`)));
}

module.exports = {
  COMMIT_MESSAGE,
  DATA_PATH,
  INDEX_REL,
  parseFlags,
  dataBranchName,
  prTitle,
  prBody,
  planPrFlow,
  parsePrRef
};

if (require.main === module) {
  main().catch((e) => die(e && e.stack ? e.stack : String(e)));
}
