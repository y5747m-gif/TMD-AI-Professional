"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-videos-"));
process.env.MISHKAT_DATA_DIR = DATA_DIR;
process.env.MISHKAT_AI_MODE = "off";
process.env.MISHKAT_VIDEO_OEMBED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");

const videos = require("../lib/videos");
const config = require("../lib/config");

function seed() {
  fs.writeFileSync(
    config.VIDEOS_PATH,
    JSON.stringify(
      {
        format: "mishkat-videos/v1",
        channel: { id: config.CHANNEL_ID, url: config.CHANNEL_URL, title: "قناة تجريبية" },
        videos: [
          {
            id: "aaaaaaaaaaa",
            title: "شرح أحكام زكاة الفطر ومقدارها",
            url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
            description: "درس في فقه الزكاة",
            tags: ["زكاة", "فقه", "صيام"]
          },
          {
            id: "bbbbbbbbbbb",
            title: "أحكام الصلاة: شروطها وأركانها",
            url: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
            description: "شرح مبسط لأحكام الصلاة",
            tags: ["صلاة", "طهارة"]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
}

test("بيانات اللائحة: قراءة وأرشفة الروابط فقط", () => {
  videos.ensureCatalogFile();
  seed();
  const catalog = videos.readCatalog({ force: true });
  assert.equal(catalog.videos.length, 2);
  assert.ok(Array.isArray(catalog.videos[0].tags));
  const stats = videos.stats();
  assert.equal(stats.total, 2);
  assert.equal(stats.channel.title, "قناة تجريبية");
});

test("استخراج معرّف الفيديو من كل صيغ روابط يوتيوب", () => {
  assert.equal(videos.extractVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(videos.extractVideoId("https://youtu.be/abcdefghijk?t=30"), "abcdefghijk");
  assert.equal(videos.extractVideoId("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(videos.extractVideoId("https://www.youtube.com/embed/abcdefghijk"), "abcdefghijk");
  assert.equal(videos.extractVideoId("abcdefghijk"), "abcdefghijk");
  assert.equal(videos.extractVideoId("https://example.com/video"), "");
});

test("البحث يربط السؤال بالفيديوهات ويعيد روابط لا نصوصًا", () => {
  const zakat = videos.search("ما مقدار زكاة الفطر؟");
  assert.ok(zakat.videos.length >= 1);
  assert.equal(zakat.videos[0].id, "aaaaaaaaaaa");
  assert.ok(zakat.videos[0].url.startsWith("https://www.youtube.com/watch?v="));
  assert.ok(!Object.prototype.hasOwnProperty.call(zakat.videos[0], "transcript"));
  assert.ok(!Object.prototype.hasOwnProperty.call(zakat.videos[0], "text"));

  const salah = videos.search("أحكام الصلاة وشروطها");
  assert.equal(salah.videos[0].id, "bbbbbbbbbbb");

  const unrelated = videos.search("أحكام التجارة الدولية والجمارك");
  assert.equal(unrelated.videos.length, 0, "لا نتائج عند عدم وجود صلة");
});

test("الإضافة والحذف والاستيراد يحفظان في ملف اللائحة", async () => {
  seed();
  const added = await videos.add({
    url: "https://www.youtube.com/watch?v=ccccccccccc",
    title: "درس تجريبي ثالث",
    tags: ["حديث"]
  });
  assert.equal(added.total, 3);
  assert.equal(added.video.tags[0], "حديث");

  const updated = await videos.add({ id: "ccccccccccc", title: "عنوان محدَّث" });
  assert.equal(updated.updated, true);
  assert.equal(videos.get("ccccccccccc").title, "عنوان محدَّث");
  assert.equal(updated.total, 3, "التحديث لا يكرّر العنصر");

  const imported = videos.importList("درس رابع | https://youtu.be/ddddddddddd", {});
  assert.equal(imported.added, 1);
  assert.equal(videos.get("ddddddddddd").title, "درس رابع");

  const removed = videos.remove("ccccccccccc");
  assert.equal(removed.removed, true);
  assert.equal(removed.total, 3, "يبقى في اللائحة ما بقي بعد الحذف");

  const notFound = videos.remove("zzzzzzzzzzz");
  assert.equal(notFound.removed, false);
});

test("السرد والبحث في العناوين", () => {
  seed();
  assert.equal(videos.list({}).total, 2);
  assert.equal(videos.list({ q: "الصلاة" }).total, 1);
  assert.equal(videos.list({ limit: 1 }).items.length, 1);
});

test("لائحة غير موجودة تُنتج نتيجة فارغة بلا انهيار", () => {
  fs.rmSync(config.VIDEOS_PATH, { force: true });
  const result = videos.search("أي سؤال");
  assert.equal(result.videos.length, 0);
  assert.equal(result.hasCatalog, false);
  seed();
});
