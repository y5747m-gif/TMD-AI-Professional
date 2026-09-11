"use strict";

/**
 * mishkat/test/restore.test.js
 * ---------------------------------------------------------------
 * اختبارات مسار «استعادة بيانات القناة الحقيقية» (npm run restore):
 * قراءة الأعلام، تسمية فرع البيانات، عنوان/نص طلب السحب، خطة أوامر
 * مسار PR، وقراءة رقم الطلب من ناتج gh — وأن طلب السكربت (require)
 * لا ينفّذ أي أمر git ولا يدفع شيئًا.
 * ---------------------------------------------------------------
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const restore = require("../scripts/restore-real-data.js");
const config = require("../lib/config");

test("require للسكربت لا ينفّذ أي أمر ولا يُخرج شيئًا", () => {
  const res = spawnSync(
    process.execPath,
    ["-e", `require(${JSON.stringify(path.resolve(__dirname, "..", "scripts", "restore-real-data.js"))});`],
    { encoding: "utf8" }
  );
  assert.equal(res.status, 0, `فشل الطلب: ${res.stderr}`);
  assert.equal(res.stdout.trim(), "", "يجب ألّا يُطبع شيء عند مجرد الطلب");
});

test("parseFlags: الأعلام المنطقية والقيمية وصيغة =value", () => {
  const f = restore.parseFlags(["node", "restore.js", "--pr", "--merge", "--limit", "10", "--branch=x"]);
  assert.equal(f.pr, true);
  assert.equal(f.merge, true);
  assert.equal(f.limit, "10");
  assert.equal(f.branch, "x");

  const g = restore.parseFlags(["node", "restore.js", "--no-push", "--base", "main"]);
  assert.equal(g["no-push"], true);
  assert.equal(g.base, "main");

  assert.deepEqual(restore.parseFlags(["node", "restore.js"]), {});
});

test("dataBranchName: اسم ثابت ومتنبَّأ به من التاريخ UTC", () => {
  const name = restore.dataBranchName(new Date("2026-09-11T15:05:00Z"));
  assert.equal(name, "mishkat/real-data-20260911-1505");
  assert.match(name, /^mishkat\/real-data-\d{8}-\d{4}$/);
});

test("prTitle: يحمل رسالة الالتزام ومعرّف القناة", () => {
  const t = restore.prTitle();
  assert.ok(t.includes(restore.COMMIT_MESSAGE), "يجب أن يتضمن رسالة الالتزام");
  assert.ok(t.includes(config.CHANNEL_ID), "يجب أن يتضمن معرّف القناة");
});

test("prBody: يوثّق الأعداد ومسار ملف البيانات وتنبيه sourceKind", () => {
  const body = restore.prBody({ listed: 120, ok: 118, skipped: 0, failed: 2, chunks: 5400 });
  assert.ok(body.includes("120") && body.includes("118") && body.includes("5400"));
  assert.ok(body.includes(restore.INDEX_REL), "يجب أن يذكر مسار ملف البيانات");
  assert.ok(body.includes("sourceKind") && body.includes("demo"), "يجب أن ينبّه على فحص sourceKind");
  assert.ok(body.includes(config.CHANNEL_ID));
  // الأرقام غير المعروفة تظهر شرطة لا رقمًا مختلَقًا
  assert.ok(restore.prBody({}).includes("—"));
});

test("planPrFlow: دفع الفرع ثم فتح PR، والدمج squash عند --merge", () => {
  const plan = restore.planPrFlow({ branch: "mishkat/real-data-x", base: "main", merge: false });
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].args, ["push", "-u", "origin", "mishkat/real-data-x"]);
  assert.equal(plan[1].cmd, "gh");
  assert.deepEqual(plan[1].args.slice(0, 6), ["pr", "create", "--base", "main", "--head", "mishkat/real-data-x"]);

  const withMerge = restore.planPrFlow({ branch: "b", base: "main", merge: true });
  assert.equal(withMerge.length, 3);
  assert.deepEqual(withMerge[2].args, ["pr", "merge", "PR_NUMBER", "--squash"]);
});

test("parsePrRef: يقرأ رقم الطلب من رابط gh أو من رقم مجرّد", () => {
  assert.deepEqual(
    restore.parsePrRef("https://github.com/o/r/pull/42\n"),
    { number: 42, url: "https://github.com/o/r/pull/42" }
  );
  assert.equal(restore.parsePrRef("7").number, 7);
  assert.equal(restore.parsePrRef(""), null);
  assert.equal(restore.parsePrRef("no pr here"), null);
});
