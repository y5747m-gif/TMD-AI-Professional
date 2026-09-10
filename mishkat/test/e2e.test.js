"use strict";

/**
 * mishkat/test/e2e.test.js
 * ---------------------------------------------------------------
 * اختبار تكاملي شامل يُثبت أن خط الأنابيب كاملًا يعمل:
 *   سرد القناة → متابعة التحميل (continuation) → استخراج النص →
 *   التنظيف والتقسيم → الفهرسة في قاعدة البيانات → الاسترجاع →
 *   الإجابة بمحرك الذكاء الاصطناعي (بثّ مباشر) → التوثيق بالرابط والتوقيت.
 *
 * يعتمد على خادم محلي يحاكي يوتيوب ومزوّد ذكاء اصطناعي متوافق مع OpenAI،
 * لذا يعمل بلا إنترنت ولا مفاتيح API.
 * ---------------------------------------------------------------
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-e2e-"));
process.env.MISHKAT_DATA_DIR = TMP;
process.env.MISHKAT_DB_PATH = path.join(TMP, "e2e.db");
process.env.MISHKAT_JSON_INDEX = path.join(TMP, "index.json");
process.env.MISHKAT_INGEST_DELAY_MS = "0";
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.MISHKAT_LLM_API_KEY;

const config = require("../lib/config");
const { openStore } = require("../lib/db");
const { ingestChannel } = require("../lib/ingest");
const retrieve = require("../lib/retrieve");
const ai = require("../lib/ai");

/* =============================================================
   ١) بيانات القناة الوهمية (فيديوهات + نصوص)
   ============================================================= */

const VIDEOS = [
  {
    id: "vidSalah0001",
    title: "أحكام صلاة الجماعة وفضل الصف الأول",
    duration: "12:30",
    views: "15ألف مشاهدة",
    script: [
      "الحمد لله والصلاة والسلام على رسول الله أما بعد فهذا درس في أحكام صلاة الجماعة وبيان فضلها العظيم",
      "صلاة الجماعة سنة مؤكدة عند جمهور العلماء وقال الحنابلة بوجوبها على الرجال القادرين وهذا هو محل الخلاف",
      "ودليل الجمهور حديث صلاة الجماعة تفضل صلاة الفذ بسبع وعشرين درجة والحديث متفق عليه عند البخاري ومسلم",
      "ويستحب للمصلي أن يحرص على الصف الأول وأن يسد الفرج وأن لا يسبق الإمام في الركوع ولا في السجود"
    ]
  },
  {
    id: "vidZakat0001",
    title: "زكاة الفطر: المقدار والوقت ومن تجب عليه",
    duration: "09:45",
    views: "8,400 views",
    script: [
      "نتحدث اليوم عن زكاة الفطر وهي فريضة على كل مسلم الصغير والكبير والذكر والأنثى كما ثبت في الصحيحين",
      "ومقدارها صاع عن كل نفس والصاع أربعة أمداد والمد ربع الصاع وهذا هو المقدار المعتبر عند جمهور أهل العلم",
      "ووقت إخراجها قبل صلاة العيد ويجوز تعجيلها قبل العيد بيوم أو يومين ومن أخرها بعد الصلاة فهي صدقة من الصدقات",
      "والحكمة منها طهرة للصائم من اللغو والرفث ومواساة للفقراء والمساكين حتى يشاركوا المسلمين فرحة العيد"
    ]
  },
  {
    id: "vidRiba00001",
    title: "الربا والمعاملات المصرفية المعاصرة",
    duration: "21:05",
    views: "1.2M views",
    script: [
      "الربا محرم بالكتاب والسنة والإجماع وهو زيادة مأخوذة في معاوضة مال بمال من غير عوض مقابلة عند أهل العلم",
      "وربا الفضل يكون بالزيادة في المقدار عند اتحاد العلة وربا النسيئة يكون بتأخير القبض أو الأجل نظير زيادة",
      "وكل قرض جر نفعا فهو ربا فإذا كان العقد قرضا بزيادة مشروطة فهو ربا محرم بإجماع الفقهاء",
      "وأما المرابحة الحقيقية في بيع السلعة فهي من أبواب البيع ويشترط أن لا تكون حيلة صورية على القرض الربوي"
    ]
  }
];

function lockupViewModel(video) {
  return {
    lockupViewModel: {
      contentId: video.id,
      contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
      metadata: {
        lockupMetadataViewModel: {
          title: { content: video.title },
          metadata: {
            contentMetadataViewModel: {
              metadataRows: [
                { metadataParts: [{ text: { content: video.views } }, { text: { content: "منذ 3 أشهر" } }] }
              ]
            }
          }
        }
      },
      contentImage: {
        thumbnailViewModel: {
          image: { sources: [{ url: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`, width: 480 }] },
          overlays: [
            {
              thumbnailOverlayBadgeViewModel: {
                thumbnailBadges: [{ thumbnailBadgeViewModel: { text: video.duration } }]
              }
            }
          ]
        }
      }
    }
  };
}

function channelPageHtml({ videos, continuationToken }) {
  const ytInitialData = {
    header: {
      pageHeaderRenderer: {
        pageHeaderViewModel: {
          title: { dynamicTextViewModel: { text: { content: "قناة مشكاة — الاختبار التكاملي" } } }
        }
      }
    },
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                richGridRenderer: {
                  contents: [
                    ...videos.map((v) => ({ richItemRenderer: { content: lockupViewModel(v) } })),
                    ...(continuationToken
                      ? [
                          {
                            continuationItemRenderer: {
                              continuationEndpoint: {
                                continuationCommand: { token: continuationToken, request: "CONTINUATION_REQUEST_TYPE_BROWSE" }
                              }
                            }
                          }
                        ]
                      : [])
                  ]
                }
              }
            }
          }
        ]
      }
    }
  };
  return `<!doctype html><html><head><title>القناة</title></head><body>
<script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script>
<script>var ytcfg = {"INNERTUBE_API_KEY":"MOCK_KEY","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20240701.00.00"};</script>
</body></html>`;
}

function watchHtml() {
  return `<!doctype html><html><body><script>
window["ytInitialPlayerResponse"] = ${JSON.stringify({ playabilityStatus: { status: "OK" } })};
var ytcfg = {"INNERTUBE_API_KEY":"MOCK_KEY","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20240701.00.00"};
</script></body></html>`;
}

function captionsJson3(videoId) {
  const video = VIDEOS.find((v) => v.id === videoId);
  if (!video) return { events: [] };
  return {
    events: video.script.map((text, i) => ({
      tStartMs: i * 20000,
      dDurationMs: 18000,
      segs: [{ utf8: text }]
    }))
  };
}

/* =============================================================
   ٢) خادم المحاكاة (يوتيوب + مزوّد الذكاء الاصطناعي)
   ============================================================= */

const captured = { aiBodies: [] };

function readRequestBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

async function startMockServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (body, type = "text/html; charset=utf-8", status = 200) => {
      res.writeHead(status, { "content-type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const sendJson = (obj, status = 200) => send(obj, "application/json; charset=utf-8", status);

    // ---- صفحات يوتيوب ----
    if (url.pathname === "/robots.txt") return send("ok", "text/plain");

    if (url.pathname.startsWith("/channel/") && url.pathname.endsWith("/videos")) {
      return send(
        channelPageHtml({ videos: VIDEOS.slice(0, 2), continuationToken: "CONT_TOKEN_1" })
      );
    }

    if (url.pathname === "/watch") return send(watchHtml());

    if (url.pathname === "/timedtext") {
      const videoId = url.searchParams.get("video") || url.searchParams.get("v") || "";
      return sendJson(captionsJson3(videoId));
    }

    if (url.pathname === "/youtubei/v1/browse") {
      await readRequestBody(req);
      return sendJson({
        contents: {
          richGridRenderer: {
            contents: VIDEOS.slice(2).map((v) => ({ richItemRenderer: { content: lockupViewModel(v) } }))
          }
        }
      });
    }

    if (url.pathname === "/youtubei/v1/player") {
      const body = JSON.parse((await readRequestBody(req)) || "{}");
      const videoId = body.videoId || "";
      const base = `http://127.0.0.1:${server.address().port}`;
      return sendJson({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: `${base}/timedtext?video=${videoId}&lang=ar`,
                languageCode: "ar",
                kind: "asr",
                name: { simpleText: "العربية (تلقائي)" }
              }
            ]
          }
        }
      });
    }

    // ---- مزوّد الذكاء الاصطناعي المتوافق مع OpenAI ----
    if (url.pathname === "/v1/chat/completions") {
      const raw = await readRequestBody(req);
      captured.aiBodies.push(raw);
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      const parts = ["## الخلاصة\n", "هذا نص تجريبي من المحرك الذكي. ", "المصدر المعتمد هو [المصدر 1].\n", "## مسائل متصلة وتوسّع\n- مسألة أولى\n"];
      for (const p of parts) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    return send("not found", "text/plain", 404);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

/* =============================================================
   ٣) الاختبارات
   ============================================================= */

let mockServer;
let store;

test.before(async () => {
  mockServer = await startMockServer();
  const base = `http://127.0.0.1:${mockServer.address().port}`;
  // توجيه وحدة يوتيوب إلى الخادم المحلي (بدل الإنترنت)
  config.YT_BASE = base;
  config.YT_API_BASE = `${base}/youtube/v3`;
  store = openStore({ reload: true });
});

test.after(async () => {
  await new Promise((resolve) => mockServer.close(resolve));
  try {
    store.close();
  } catch (_) {}
});

test("١) سحب القناة كاملة: سرد + متابعة التحميل + استخراج النصوص", async () => {
  const progress = [];
  const summary = await ingestChannel(store, {
    max: 0,
    onProgress: (p) => progress.push(p)
  });

  assert.equal(summary.listed, 3, `عدد الفيديوهات المسرودة: ${summary.listed}`);
  assert.equal(summary.ok, 3, `نجح: ${summary.ok} — الإخفاقات: ${JSON.stringify(summary.failures)}`);
  assert.equal(summary.failed, 0);
  assert.ok(summary.chunks >= 6, `عدد المقاطع: ${summary.chunks}`);
  assert.ok(summary.chars > 800, `عدد الأحرف: ${summary.chars}`);
  assert.ok(progress.some((p) => p.phase === "done"));

  const stats = store.stats();
  assert.equal(stats.videos, 3);
  assert.equal(stats.videosWithTranscript, 3);
  assert.ok(stats.segments >= 6);
});

test("٢) الإعادة لا تُكرّر العمل (تخطّي الموجود)", async () => {
  const summary = await ingestChannel(store, { max: 0 });
  assert.equal(summary.skipped, 3);
  assert.equal(summary.ok, 0);
});

test("٣) بيانات الفيديو محفوظة بدقة (العنوان والمدة والمشاهدات)", () => {
  const video = store.getVideo("vidRiba00001");
  assert.ok(video);
  assert.equal(video.title, "الربا والمعاملات المصرفية المعاصرة");
  assert.equal(video.duration_s, 21 * 60 + 5);
  assert.equal(video.views, 1200000);
  assert.equal(video.has_transcript, 1);
  assert.equal(video.transcript_lang, "ar");
  assert.equal(video.source_kind, "channel");
});

test("٤) الاسترجاع يعيد النص الصحيح مع توقيته ورابط الفيديو", () => {
  const res = retrieve.search(store, "ما حكم صلاة الجماعة وفضل الصف الأول؟");
  assert.ok(res.results.length > 0);
  const first = res.results[0];
  assert.equal(first.videoId, "vidSalah0001");
  assert.ok(first.text.includes("سبع وعشرين درجة") || first.text.includes("الجماعة"));
  assert.match(first.link, /^https:\/\/www\.youtube\.com\/watch\?v=vidSalah0001/);
  assert.ok(first.time === "00:00" || /^0\d:\d\d$/.test(first.time));
  assert.ok(first.score > 0);
});

test("٥) رابط التوقيت يقابل زمن المقطع فعليًا", () => {
  const res = retrieve.search(store, "زكاة الفطر مقدار الصاع والمد");
  assert.ok(res.results.length > 0);
  const hit = res.results.find((r) => r.videoId === "vidZakat0001");
  assert.ok(hit, "يجب أن يعود فيديو زكاة الفطر");
  const seconds = Number((hit.link.match(/t=(\d+)s/) || [])[1] || 0);
  assert.equal(Math.floor(hit.startMs / 1000), seconds);
  assert.equal(hit.time, `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
});

test("٦) سؤال لا توجد له نصوص يعطي تغطية منخفضة بدل التخمين", () => {
  const res = retrieve.search(store, "ما حكم استئجار الأقمار الصناعية لصيد السمك؟");
  assert.ok(res.coverage < 0.5);
  assert.ok(res.results.length <= 3);
});

test("٧) عرض التفريغ الكامل والبحث داخل الفيديو", () => {
  const timeline = retrieve.getVideoTimeline(store, "vidZakat0001");
  assert.ok(timeline);
  assert.ok(timeline.segments.length >= 2, `عدد المقاطع: ${timeline.segments.length}`);
  assert.equal(timeline.segments[0].time, "00:00");
  assert.ok(timeline.segments[1].startMs >= 20000);
  const inside = retrieve.searchInVideo(store, "vidZakat0001", "الصاع");
  assert.ok(inside.matches > 0);
});

test("٨) المحرك الذكي المنفصل: يبثّ الإجابة ويستقبل النصوص المرفقة كاملة", async () => {
  // تحويل المزوّد إلى الخادم المحلي
  const base = `http://127.0.0.1:${mockServer.address().port}/v1`;
  config.PROVIDERS.push({ id: "custom", label: "Mock AI", key: "test-key", model: "mock-1", base });

  const question = "ما حكم صلاة الجماعة؟";
  const res = retrieve.search(store, question);
  let streamed = "";
  const out = await ai.answerQuestion({
    question,
    retrieval: res,
    mode: "open",
    onToken: (t) => (streamed += t)
  });

  assert.equal(out.usedFallback, false);
  assert.ok(out.answer.includes("المحرك الذكي"));
  assert.equal(streamed, out.answer, "البثّ يجب أن يطابق الإجابة النهائية");
  assert.equal(captured.aiBodies.length, 1);

  const sent = JSON.parse(captured.aiBodies[0]);
  const prompt = JSON.stringify(sent);
  assert.ok(prompt.includes("المصدر 1"), "السياق يجب أن يرقّم المصادر");
  assert.ok(prompt.includes("youtube.com/watch?v=vidSalah0001"), "السياق يجب أن يحمل رابط الفيديو");
  assert.ok(prompt.includes("التوقيت"), "السياق يجب أن يحمل التوقيت");
  assert.ok(prompt.includes(question), "السؤال يجب أن يُرسل للمحرك");
  assert.equal(sent.model, "mock-1");
  assert.equal(sent.stream, true);
});

test("٩) التلخيص يعمل عبر المحرك الذكي", async () => {
  const timeline = retrieve.getVideoTimeline(store, "vidRiba00001");
  let text = "";
  const out = await ai.summarizeVideo({
    video: timeline.video,
    segments: timeline.segments,
    onToken: (t) => (text += t)
  });
  assert.ok(out.summary.length > 20);
  assert.ok(text.includes("المحرك الذكي"));
  const sent = JSON.parse(captured.aiBodies[captured.aiBodies.length - 1]);
  assert.ok(JSON.stringify(sent).includes("الربا"), "نص الدرس يجب أن يصل للمحرك");
});

test("١٠) التصدير إلى JSON صالح للاستخدام على Vercel", () => {
  const out = store.exportJsonIndex();
  assert.ok(fs.existsSync(out.file));
  const data = JSON.parse(fs.readFileSync(out.file, "utf8"));
  assert.equal(data.format, "mishkat-index/v1");
  assert.equal(data.channel.id, config.CHANNEL_ID);
  assert.equal(data.videos.length, 3);
  assert.ok(data.videos.every((v) => Array.isArray(v.segments) && v.segments.length > 0));

  // إعادة القراءة من الملف عبر المتجر البديل تُعطي نتائج بحث صحيحة
  const { JsonStore } = require("../lib/db");
  const jsonStore = new JsonStore(out.file);
  const res = retrieve.search(jsonStore, "الربا في البنوك");
  assert.ok(res.results.length > 0);
  assert.ok(res.results[0].videoId.includes("Riba"));
});

test("١١) طلب واجهة API كامل عبر الخادم مع البثّ", async () => {
  const { server } = require("../server");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "ما مقدار زكاة الفطر؟", stream: true })
    });
    const text = await res.text();
    assert.ok(text.includes("event: sources"));
    assert.ok(text.includes("vidZakat0001"));
    assert.ok(text.includes("event: token"));
    assert.ok(text.includes("event: done"));

    const nonStream = await (
      await fetch(`http://127.0.0.1:${port}/api/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ما مقدار زكاة الفطر؟", stream: false })
      })
    ).json();
    assert.equal(nonStream.ok, true);
    assert.ok(nonStream.sources.some((s) => s.videoId === "vidZakat0001"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
