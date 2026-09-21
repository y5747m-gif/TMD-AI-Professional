"use strict";

/* =========================================================================
   مشكاة — واجهة الويب
   • الردود تُجلب من موقع إسلام ويب عبر الخادم (فتاوى/استشارات/مقالات).
   • الفيديوهات تُعرَض كروابط فقط — بلا أي نصوص أو تفريغات.
   ========================================================================= */

const API = {
  health: "/api/health",
  config: "/api/config",
  stats: "/api/stats",
  ask: "/api/ask",
  search: "/api/search",
  videos: "/api/videos",
  video: "/api/video",
  diagnose: "/api/diagnose",
  suggest: "/api/suggest"
};

const state = {
  config: null,
  stats: null,
  videos: [],
  history: [],
  mode: "composed",
  adminToken: localStorage.getItem("mishkat.adminToken") || "",
  abort: null,
  streaming: false
};

/* =========================================================================
   1) أدوات عامة
   ========================================================================= */

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}

function toast(message, kind = "") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

function $(id) {
  return document.getElementById(id);
}

/* =========================================================================
   2) عرض Markdown
   ========================================================================= */

function inlineFormat(text) {
  let t = escapeHtml(text);

  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const href = safeUrl(url.replace(/&amp;/g, "&"));
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>` : label;
  });

  t = t.replace(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}[^\s<)]*)/g, (m) => {
    const href = safeUrl(m);
    if (!href) return m;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="cite">▶ مشاهدة الفيديو</a>`;
  });

  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(
    /\((?:فتوى|استشارة|مقال)\s*رقم\s*([0-9٠-٩]+)[^)]*\)/g,
    (m, n) => `<span class="cite">${escapeHtml(m.slice(1, -1))}</span>`
  );
  return t;
}

function markdownToHtml(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let listType = null;
  let inQuote = false;
  let paragraph = [];
  let tableRows = [];

  const closeParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.map(inlineFormat).join("<br/>")}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r));
    if (rows.length) {
      const cells = (row) =>
        row
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).map((r) => cells(r));
      out.push(
        "<table><thead><tr>" +
          head.map((h) => `<th>${inlineFormat(h)}</th>`).join("") +
          "</tr></thead><tbody>"
      );
      for (const r of body) out.push("<tr>" + r.map((c) => `<td>${inlineFormat(c)}</td>`).join("") + "</tr>");
      out.push("</tbody></table>");
    }
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeParagraph();
      closeList();
      closeQuote();
      tableRows.push(line);
      continue;
    }
    flushTable();

    if (!line.trim()) {
      closeParagraph();
      closeList();
      closeQuote();
      continue;
    }

    let m;
    if ((m = line.match(/^\s*(#{1,6})\s+(.*)$/))) {
      closeParagraph();
      closeList();
      closeQuote();
      const level = Math.min(6, m[1].length + 1);
      out.push(`<h${level}>${inlineFormat(m[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      closeParagraph();
      closeList();
      closeQuote();
      out.push("<hr/>");
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      closeParagraph();
      closeList();
      if (!inQuote) {
        out.push("<blockquote>");
        inQuote = true;
      }
      out.push(`<p>${inlineFormat(m[1])}</p>`);
      continue;
    }
    closeQuote();

    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      closeParagraph();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inlineFormat(m[1])}</li>`);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      closeParagraph();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inlineFormat(m[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  closeParagraph();
  closeList();
  closeQuote();
  flushTable();
  return out.join("\n");
}

/* =========================================================================
   3) الشبكة
   ========================================================================= */

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `تعذّر الاتصال (${res.status})`);
  return data;
}

async function adminHeaders(extra = {}) {
  const headers = { "content-type": "application/json", ...extra };
  if (state.adminToken) headers["x-admin-token"] = state.adminToken;
  return headers;
}

/* =========================================================================
   4) المحادثة
   ========================================================================= */

function hideWelcome() {
  const welcome = $("welcome");
  if (welcome) welcome.hidden = true;
}

function scrollChat() {
  const chat = $("chat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function renderUserMessage(text) {
  const chat = $("chat");
  const wrap = document.createElement("article");
  wrap.className = "msg user";
  wrap.innerHTML = `
    <div class="msg-head"><div class="avatar">أنت</div></div>
    <div class="bubble">${markdownToHtml(text)}</div>`;
  chat.appendChild(wrap);
  scrollChat();
}

function renderAssistantShell() {
  const chat = $("chat");
  const wrap = document.createElement("article");
  wrap.className = "msg assistant";
  wrap.innerHTML = `
    <div class="msg-head">
      <div class="avatar">مشكاة</div>
      <div class="meta" id="pendingMeta">أبحث في موقع إسلام ويب…</div>
    </div>
    <div class="bubble">
      <div class="typing"><span></span><span></span><span></span></div>
      <div class="answer-body"></div>
      <div class="answer-extras"></div>
    </div>`;
  chat.appendChild(wrap);
  scrollChat();
  return {
    root: wrap,
    meta: wrap.querySelector(".meta"),
    body: wrap.querySelector(".answer-body"),
    extras: wrap.querySelector(".answer-extras"),
    typing: wrap.querySelector(".typing")
  };
}

function sourceCard(source) {
  const kindClass = source.kind === "fatwa" ? "fatwa" : source.kind === "consult" ? "consult" : "article";
  const link = safeUrl(source.url) || "#";
  return `
    <a class="source-card ${kindClass}" href="${escapeHtml(link)}" target="_blank" rel="noopener">
      <div class="source-head">
        <span class="source-kind">${escapeHtml(source.kindLabel || "مصدر")}</span>
        <span class="source-num">رقم ${escapeHtml(String(source.number || source.id || ""))}</span>
        ${source.date ? `<span class="source-date">${escapeHtml(source.date)}</span>` : ""}
      </div>
      <div class="source-title">${escapeHtml(source.title || "")}</div>
      ${source.snippet ? `<div class="source-snippet">${escapeHtml(source.snippet)}</div>` : ""}
      <div class="source-foot">
        ${source.fetched ? '<span class="badge ok">نصّ الجواب مُستخرَج</span>' : '<span class="badge">مقتطف</span>'}
        <span class="muted small">إسلام ويب ↗</span>
      </div>
    </a>`;
}

function renderExtras(container, { sources = [], videos = [], notes = [], provider = "" }) {
  const parts = [];

  if (sources.length) {
    parts.push(`<section class="extras-block">
      <h4 class="extras-title">مصادر الرد من موقع إسلام ويب (${sources.length})</h4>
      <div class="source-grid">${sources.map(sourceCard).join("")}</div>
    </section>`);
  }

  if (videos.length) {
    parts.push(`<section class="extras-block">
      <h4 class="extras-title">روابط فيديوهات مرتبطة بالسؤال (${videos.length})</h4>
      <ul class="video-links">
        ${videos
          .map(
            (v) =>
              `<li><a href="${escapeHtml(safeUrl(v.url) || "#")}" target="_blank" rel="noopener">▶ ${escapeHtml(
                v.title
              )}</a></li>`
          )
          .join("")}
      </ul>
      <p class="muted small">روابط فقط — لا تُخزَّن نصوص الفيديوهات ولا تُعرض داخل الأداة.</p>
    </section>`);
  }

  if (notes.length || provider) {
    const items = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
    parts.push(`<section class="extras-block notes">
      <h4 class="extras-title">ملاحظات</h4>
      <ul>${items}${provider ? `<li>المحرك المستخدم: ${escapeHtml(provider)}</li>` : ""}</ul>
    </section>`);
  }

  container.innerHTML = parts.join("");
}

async function ask(question) {
  if (state.streaming) return;
  hideWelcome();
  renderUserMessage(question);

  const shell = renderAssistantShell();
  const controller = new AbortController();
  state.abort = controller;
  state.streaming = true;
  $("stopBtn").hidden = false;

  let answer = "";
  let meta = null;

  const paint = () => {
    shell.body.innerHTML = markdownToHtml(answer);
    scrollChat();
  };

  const applyMeta = (info) => {
    meta = { ...(meta || {}), ...info };
    const bits = [];
    if (meta.sources && meta.sources.length) bits.push(`${meta.sources.length} مصدر من إسلام ويب`);
    if (meta.videos && meta.videos.length) bits.push(`${meta.videos.length} فيديو مرتبط`);
    if (!bits.length) bits.push("جارٍ البحث في إسلام ويب…");
    shell.meta.textContent = bits.join(" • ");
    if (meta.sources || meta.videos || meta.notes) {
      renderExtras(shell.extras, {
        sources: meta.sources || [],
        videos: meta.videos || [],
        notes: meta.notes || [],
        provider: meta.providerLabel || ""
      });
    }
  };

  try {
    const res = await fetch(API.ask, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        question,
        mode: state.mode,
        history: state.history.slice(-6),
        stream: true
      }),
      signal: controller.signal
    });

    if (!res.ok || !(res.headers.get("content-type") || "").includes("text/event-stream")) {
      // لا بثّ (أو خطأ): نقرأ الرد كـJSON
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `تعذّر الطلب (${res.status})`);
      answer = data.answer || "";
      applyMeta({
        sources: data.sources,
        videos: data.videos,
        notes: data.notes,
        providerLabel: data.providerInfo ? data.providerInfo.label : data.provider
      });
      shell.typing.remove();
      paint();
      state.history.push({ role: "user", content: question });
      state.history.push({ role: "assistant", content: answer.slice(0, 1200) });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let currentEvent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        let event = currentEvent;
        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        }
        currentEvent = "";
        if (!dataLine) continue;

        let payload;
        try {
          payload = JSON.parse(dataLine);
        } catch (_) {
          continue;
        }

        if (event === "meta") {
          applyMeta({
            sources: payload.sources,
            videos: payload.videos,
            notes: payload.notes,
            providerLabel: payload.provider ? payload.provider.label : ""
          });
          if (shell.typing.parentNode) shell.typing.remove();
        } else if (event === "token") {
          if (shell.typing.parentNode) shell.typing.remove();
          answer += payload.text || "";
          paint();
        } else if (event === "done") {
          applyMeta({
            sources: payload.sources,
            videos: payload.videos,
            notes: payload.notes,
            providerLabel: payload.provider
          });
          if (payload.error) toast(`تنبيه: ${payload.error}`, "warn");
        } else if (event === "error") {
          throw new Error(payload.error || "خطأ في البث");
        }
      }
    }

    if (!answer) answer = "لم يصل ردّ من المصدر. أعد المحاولة أو جرّب صياغة أخرى للسؤال.";
    if (shell.typing.parentNode) shell.typing.remove();
    paint();
    state.history.push({ role: "user", content: question });
    state.history.push({ role: "assistant", content: answer.slice(0, 1200) });
  } catch (err) {
    if (shell.typing.parentNode) shell.typing.remove();
    if (err.name === "AbortError") {
      answer += "\n\n> ⏹ أُوقف الطلب.";
      paint();
    } else {
      shell.body.innerHTML = `<p class="error">${escapeHtml(String(err.message || err))}</p>`;
      toast(String(err.message || err), "err");
    }
  } finally {
    state.streaming = false;
    state.abort = null;
    $("stopBtn").hidden = true;
    scrollChat();
  }
}

/* =========================================================================
   5) الشريط الجانبي
   ========================================================================= */

function renderSuggestions(list) {
  const box = $("suggestions");
  box.innerHTML = "";
  for (const item of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.textContent = item;
    btn.addEventListener("click", () => {
      $("input").value = item;
      submitQuestion();
    });
    box.appendChild(btn);
  }
}

async function loadVideos(q = "") {
  const box = $("videoList");
  try {
    const data = await getJson(`${API.videos}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    state.videos = data.videos || [];
    box.innerHTML = "";
    if (!data.videos.length) {
      box.innerHTML = `
        <p class="muted small">${q ? "لا نتائج مطابقة." : "اللائحة فارغة — أضِف روابط الفيديوهات بزر ＋ ."}</p>
        <a class="ghost-btn" style="text-align:center" href="https://www.youtube.com/channel/UCv0g_v1C6JcZALvrkDu98AQ" target="_blank" rel="noopener">فتح قناة الفيديوهات ↗</a>`;
      return;
    }
    for (const video of data.videos) {
      const link = document.createElement("a");
      link.className = "video-item";
      link.href = safeUrl(video.url) || "#";
      link.target = "_blank";
      link.rel = "noopener";
      link.innerHTML = `
        <div class="v-title">${escapeHtml(video.title || video.id)}</div>
        <div class="v-meta">
          <span class="muted small">▶ فتح في يوتيوب</span>
          ${(video.tags || []).slice(0, 3).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>`;
      box.appendChild(link);
    }
  } catch (err) {
    box.innerHTML = `<p class="muted small">تعذّر تحميل اللائحة: ${escapeHtml(String(err.message || err))}</p>`;
  }
}

function renderStats(data) {
  const box = $("statsBox");
  const videos = data.videos || {};
  box.innerHTML = `
    <div class="stat"><b>${videos.total || 0}</b><span>رابط فيديو</span></div>
    <div class="stat"><b>${data.islamwebCache ? data.islamwebCache.entries : 0}</b><span>صفحة في الذاكرة المؤقتة</span></div>
    <div class="stat"><b>${escapeHtml((data.ai && data.ai.label) || "—")}</b><span>محرك الصياغة</span></div>
    <div class="stat"><b>إسلام ويب</b><span>مصدر الردود</span></div>`;
}

async function loadStats() {
  try {
    const data = await getJson(API.stats);
    state.stats = data;
    renderStats(data);
  } catch (_) {
    $("statsBox").innerHTML = '<span class="muted small">تعذّر قراءة الحالة.</span>';
  }
}

function renderHealth(health) {
  const dot = $("islamwebDot");
  const label = $("islamwebLabel");
  if (health.islamweb && health.islamweb.enabled) {
    dot.className = "dot on";
    label.textContent = `إسلام ويب: ${health.islamweb.mode}`;
  } else {
    dot.className = "dot off";
    label.textContent = "إسلام ويب: معطّل";
  }

  const aiDot = $("aiDot");
  const aiLabel = $("aiLabel");
  if (health.ai && health.ai.enabled) {
    aiDot.className = "dot on";
    aiLabel.textContent = health.ai.label;
  } else {
    aiDot.className = "dot off";
    aiLabel.textContent = "نقل حرفي (بلا مفتاح)";
  }

  $("videosLabel").textContent = `${health.videos ? health.videos.total : 0} فيديو`;

  if (health.videos && health.videos.total === 0) {
    const notice = $("notice");
    notice.hidden = false;
    notice.innerHTML =
      'لائحة الفيديوهات فارغة الآن: أضِف روابط الفيديوهات (عنوان + رابط) من زر ⚙ ثم «إضافة فيديو»، ' +
      'أو بالأمر <code>npm run video:add -- --url "الرابط" --title "العنوان"</code> — وستظهر تلقائيًا كروابط مرتبطة بالسؤال.';
  }
}

async function loadConfig() {
  const data = await getJson(API.config);
  state.config = data;

  $("channelChip").href = (data.channel && data.channel.url) || "#";
  $("channelLabel").textContent = (data.channel && data.channel.title) || "القناة";
  if (data.app && data.app.tagline) $("brandTagline").textContent = data.app.tagline;

  state.mode = data.app && data.app.defaultMode ? data.app.defaultMode : "composed";
  const radio = document.querySelector(`input[name="mode"][value="${state.mode}"]`);
  if (radio) radio.checked = true;

  renderSuggestions(data.suggestions || []);

  const cards = $("welcomeCards");
  cards.innerHTML = `
    <div class="wcard"><strong>من إسلام ويب مباشرةً</strong><span>فتاوى ومركز الفتوى و${escapeHtml(
      "الاستشارات والمقالات"
    )} — مع رقم كل مصدر ورابطه.</span></div>
    <div class="wcard"><strong>روابط الفيديوهات</strong><span>يُقترح أقرب الفيديوهات للسؤال كروابط فقط، بلا نسخ كامل للنصوص.</span></div>
    <div class="wcard"><strong>صياغة اختيارية</strong><span>عند إضافة مفتاح ذكاء اصطناعي يُنظَّم الرد المنقول بلا زيادة معنى.</span></div>`;
}

/* =========================================================================
   6) الإدارة
   ========================================================================= */

function openModal(id) {
  $(id).hidden = false;
}

function closeModal(id) {
  $(id).hidden = true;
}

async function saveVideo() {
  const url = $("videoUrl").value.trim();
  const title = $("videoTitle").value.trim();
  const tags = $("videoTags").value.trim();
  if (!url) return toast("ألصق رابط الفيديو أولًا.", "err");
  try {
    const res = await fetch(API.videos, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify({ url, title, tags: tags ? tags.split(/[,،|]/).map((t) => t.trim()) : [] })
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || "تعذّرت الإضافة");
    toast(`✓ ${data.updated ? "حُدِّث" : "أُضيف"}: ${data.video.title}`, "ok");
    $("videoUrl").value = "";
    $("videoTitle").value = "";
    $("videoTags").value = "";
    await loadVideos();
    await loadStats();
  } catch (err) {
    toast(String(err.message || err), "err");
  }
}

async function importVideos() {
  const raw = $("importText").value.trim();
  if (!raw) return toast("ألصق اللائحة أولًا.", "err");
  const replace = $("importReplace").checked;
  const log = $("importLog");
  log.hidden = false;
  log.innerHTML = "<div>⏳ جارٍ الاستيراد…</div>";

  try {
    const res = await fetch(API.videos, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify({ text: raw, replace })
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || "فشل الاستيراد");
    log.innerHTML =
      `<div class="ok">✓ أُضيف: ${data.added || 0} — حُدِّث: ${data.updated || 0} — الإجمالي: ${data.total || 0}</div>` +
      (replace ? '<div class="skip">تم استبدال اللائحة بالكامل.</div>' : "");
    toast(`استيراد: ${data.added || 0} جديد، ${data.updated || 0} محدَّث`, "ok");
  } catch (err) {
    log.innerHTML = `<div class="fail">✗ ${escapeHtml(String(err.message || err))}</div>`;
    toast(String(err.message || err), "err");
  }

  await loadVideos();
  await loadStats();
}

async function runDiagnose(probe = false) {
  const box = $("diagnoseBox");
  box.hidden = false;
  box.innerHTML = '<p class="muted small">جارٍ الفحص…</p>';
  try {
    const data = await getJson(`${API.diagnose}${probe ? "?probe=1" : ""}`);
    box.innerHTML = `
      <p><strong>${escapeHtml(data.summary || "")}</strong></p>
      <ul class="diag-list">
        ${(data.checks || [])
          .map(
            (c) =>
              `<li class="${c.level}"><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.detail || "")}</li>`
          )
          .join("")}
      </ul>`;
  } catch (err) {
    box.innerHTML = `<p class="error">${escapeHtml(String(err.message || err))}</p>`;
  }
}

async function clearCache() {
  try {
    const res = await fetch("/api/cache/clear", { method: "POST", headers: await adminHeaders() });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || "تعذّر التفريغ");
    toast(data.message || "تم تفريغ الذاكرة المؤقتة.", "ok");
    await loadStats();
  } catch (err) {
    toast(String(err.message || err), "err");
  }
}

/* =========================================================================
   7) الأحداث
   ========================================================================= */

function submitQuestion() {
  const input = $("input");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  input.style.height = "auto";
  ask(question);
}

function autoGrow() {
  const el = $("input");
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
}

function bind() {
  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    submitQuestion();
  });

  $("input").addEventListener("input", autoGrow);
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  });

  $("stopBtn").addEventListener("click", () => {
    if (state.abort) state.abort.abort();
  });

  $("newChatBtn").addEventListener("click", () => {
    $("chat").innerHTML = "";
    $("chat").appendChild($("welcome"));
    $("welcome").hidden = false;
    state.history = [];
  });

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.mode = radio.value;
      toast(radio.value === "sources" ? "الرد سيُعرض منقولًا كما هو." : "الرد سيُصاغ ومنظَّمًا.");
    });
  });

  $("videoSearch").addEventListener("input", (e) => loadVideos(e.target.value.trim()));
  $("addVideoBtn").addEventListener("click", () => openModal("adminModal"));
  $("adminBtn").addEventListener("click", () => openModal("adminModal"));
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("overlay").addEventListener("click", () => $("sidebar").classList.remove("open"));

  document.querySelectorAll("[data-close]").forEach((btn) =>
    btn.addEventListener("click", () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll(".modal").forEach((modal) =>
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    })
  );

  $("saveVideo").addEventListener("click", saveVideo);
  $("importVideos").addEventListener("click", importVideos);
  $("runDiagnose").addEventListener("click", () => runDiagnose(false));
  $("runProbe").addEventListener("click", () => runDiagnose(true));
  $("clearCache").addEventListener("click", clearCache);
  $("adminToken").addEventListener("input", (e) => {
    state.adminToken = e.target.value.trim();
    localStorage.setItem("mishkat.adminToken", state.adminToken);
  });

  const tokenField = $("adminToken");
  if (tokenField) tokenField.value = state.adminToken;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
  });
}

async function init() {
  bind();
  autoGrow();
  try {
    const health = await getJson(API.health);
    renderHealth(health);
  } catch (err) {
    toast(`تعذّر الاتصال بالخادم: ${String(err.message || err)}`, "err");
  }
  try {
    await loadConfig();
  } catch (err) {
    toast(String(err.message || err), "err");
  }
  await Promise.all([loadVideos(), loadStats()]);
}

init();
