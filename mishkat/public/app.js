/* =============================================================
   مشكاة — منطق الواجهة
   ============================================================= */
"use strict";

const API = {
  config: "/api/config",
  stats: "/api/stats",
  ask: "/api/ask",
  search: "/api/search",
  videos: "/api/videos",
  video: (id) => `/api/video/${encodeURIComponent(id)}`,
  ingest: "/api/ingest",
  purgeDemo: "/api/purge-demo",
  summarize: "/api/summarize"
};

const state = {
  mode: "balanced",
  messages: [],
  config: null,
  busy: false,
  controller: null,
  adminToken: sessionStorage.getItem("mishkat_admin_token") || "",
  currentVideoId: null
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
};

/* =============================================================
   1) أدوات عامة
   ============================================================= */

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url) {
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u) ? u : "";
}

function toast(message, kind = "") {
  const node = el("div", `toast ${kind}`, escapeHtml(message));
  $("toasts").appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
    node.style.transition = ".35s";
    setTimeout(() => node.remove(), 380);
  }, kind === "err" ? 6500 : 3800);
}

function timeText(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* =============================================================
   2) عرض Markdown مبسّط وآمن
   ============================================================= */

function inlineFormat(text) {
  let t = escapeHtml(text);

  // روابط Markdown
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const href = safeUrl(url.replace(/&amp;/g, "&"));
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>` : label;
  });

  // روابط يوتيوب عارية
  t = t.replace(
    /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}[^\s<)]*)/g,
    (m) => {
      const href = safeUrl(m);
      if (!href) return m;
      const tMatch = href.match(/[?&]t=(\d+)s?/);
      const label = tMatch ? `▶ مشاهدة عند ${timeText(Number(tMatch[1]) * 1000)}` : "▶ مشاهدة";
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="cite">${label}</a>`;
    }
  );

  // **عريض**
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *مائل*
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // `كود`
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  // [المصدر 1] / [مرجع 2] => شارة
  t = t.replace(/\[(المصدر|مرجع|المصادر|المرجع)\s*([0-9٠-٩]+)\]/g, (m, word, n) => {
    const num = String(n).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    return `<span class="cite">${word} ${num}</span>`;
  });
  // التوقيت بين قوسين
  t = t.replace(/\(\s*(?:التوقيت\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s*\)/g, (m, tm) => `<span class="cite">⏱ ${tm}</span>`);

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
      out.push("<table><thead><tr>" + head.map((h) => `<th>${inlineFormat(h)}</th>`).join("") + "</tr></thead><tbody>");
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
      closeParagraph(); closeList(); closeQuote();
      const level = Math.min(6, m[1].length + 1);
      out.push(`<h${level}>${inlineFormat(m[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      closeParagraph(); closeList(); closeQuote();
      out.push("<hr/>");
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      closeParagraph(); closeList();
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

/* =============================================================
   3) طلبات الشبكة و SSE
   ============================================================= */

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`خطأ ${res.status}`);
  return res.json();
}

async function postJson(url, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

/** يقرأ بثّ SSE ويمرّر الأحداث إلى onEvent */
async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data));
      } catch (_) {
        /* تجاهل */
      }
    }
  }
}

/* =============================================================
   4) الرسائل والعرض
   ============================================================= */

function hideWelcome() {
  const w = $("welcome");
  if (w) w.style.display = "none";
}

function scrollChat(force = false) {
  const chat = $("chat");
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 220;
  if (force || nearBottom) chat.scrollTop = chat.scrollHeight;
}

function renderUserMessage(text) {
  hideWelcome();
  const wrap = el("article", "msg user");
  wrap.innerHTML = `
    <div class="msg-head"><span class="avatar">أنا</span><span>أنت</span></div>
    <div class="bubble">${escapeHtml(text).replace(/\n/g, "<br/>")}</div>`;
  $("chat").appendChild(wrap);
  scrollChat(true);
  return wrap;
}

function renderAssistantShell(meta = {}) {
  hideWelcome();
  const wrap = el("article", "msg assistant");
  const engine = meta.engineLabel ? `<span class="chip chip-quiet">${escapeHtml(meta.engineLabel)}</span>` : "";
  wrap.innerHTML = `
    <div class="msg-head">
      <span class="avatar">✦</span>
      <span>مشكاة</span>
      ${engine}
      <span class="mode-tag muted">${escapeHtml(modeLabel(state.mode))}</span>
    </div>
    <div class="bubble"><span class="thinking"><span class="spinner"></span> جارٍ البحث في نصوص القناة…</span></div>
    <div class="sources" hidden></div>
    <div class="msg-actions" hidden></div>`;
  $("chat").appendChild(wrap);
  scrollChat(true);
  return wrap;
}

function modeLabel(mode) {
  return { strict: "وضع صارم", balanced: "وضع متوازن", open: "وضع واسع المجال" }[mode] || mode;
}

function renderSources(container, sources, docs) {
  if (!container) return;
  container.innerHTML = "";
  if (!sources.length && !docs.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  if (sources.length) {
    container.appendChild(el("div", "sources-title", `النصوص من القناة (${sources.length})`));
    sources.forEach((s, i) => {
      const card = el("div", "source-card");
      const badge = s.sourceKind === "demo" ? '<span class="badge">بيانات تجريبية</span>' : "";
      card.innerHTML = `
        <div class="source-head">
          <span class="source-num">${i + 1}</span>
          <span class="source-title">${escapeHtml(s.title || "")}</span>
          ${badge}
          <span class="time-badge">${escapeHtml(s.time || "")}</span>
        </div>
        <div class="source-text">${escapeHtml(s.text || s.excerpt || "")}</div>
        <div class="source-foot">
          <button class="action-btn" data-open-video="${escapeHtml(s.videoId)}" data-start="${s.startMs || 0}">📖 اقرأ النص في سياقه</button>
          <a class="action-btn" href="${escapeHtml(safeUrl(s.link) || "#")}" target="_blank" rel="noopener">↗ فتح الفيديو عند التوقيت</a>
          <span class="meta">صلة النص بالسؤال: ${Math.round((s.score || 0) * 100)}%</span>
        </div>`;
      container.appendChild(card);
    });
  }

  if (docs && docs.length) {
    container.appendChild(el("div", "sources-title", `مراجع إضافية (${docs.length})`));
    docs.forEach((d) => {
      const card = el("div", "source-card");
      card.innerHTML = `
        <div class="source-head">
          <span class="source-num">◈</span>
          <span class="source-title">${escapeHtml(d.title || "")}</span>
          ${d.ref ? `<span class="badge">${escapeHtml(d.ref)}</span>` : ""}
        </div>
        <div class="source-text expanded">${escapeHtml(d.text || "")}</div>`;
      container.appendChild(card);
    });
  }
}

function renderActions(wrap, text) {
  const box = wrap.querySelector(".msg-actions");
  box.hidden = false;
  box.innerHTML = "";
  const copy = el("button", "action-btn", "⧉ نسخ الإجابة");
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("تم نسخ الإجابة", "ok");
    } catch (_) {
      toast("تعذّر النسخ", "err");
    }
  };
  const again = el("button", "action-btn", "↻ إعادة الصياغة");
  again.onclick = () => {
    const lastUser = [...state.messages].reverse().find((m) => m.role === "user");
    if (lastUser) ask(lastUser.content, { regenerate: true });
  };
  box.appendChild(copy);
  box.appendChild(again);
}

function renderHistory() {
  $("chat").innerHTML = "";
  if (!state.messages.length) {
    $("chat").innerHTML = welcomeMarkup();
    bindWelcome();
    return;
  }
  for (const m of state.messages) {
    if (m.role === "user") {
      renderUserMessage(m.content);
    } else {
      const wrap = renderAssistantShell({ engineLabel: m.engineLabel });
      wrap.querySelector(".bubble").innerHTML = markdownToHtml(m.content);
      renderSources(wrap.querySelector(".sources"), m.sources || [], m.docs || []);
      if (m.content) renderActions(wrap, m.content);
    }
  }
  scrollChat(true);
}

/* =============================================================
   5) السؤال والجواب
   ============================================================= */

async function ask(question, opts = {}) {
  if (state.busy) return;
  const q = String(question || "").trim();
  if (!q) return;

  state.busy = true;
  $("send").disabled = true;
  $("stopBtn").hidden = false;

  const history = state.messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
  if (!opts.regenerate) {
    state.messages.push({ role: "user", content: q });
    renderUserMessage(q);
  }

  const engine = state.config?.ai || {};
  const wrap = renderAssistantShell({
    engineLabel: engine.enabled ? `${engine.label}` : "محرك استخراجي"
  });
  const bubble = wrap.querySelector(".bubble");
  const sourcesBox = wrap.querySelector(".sources");

  state.controller = new AbortController();
  let answerText = "";
  let sources = [];
  let docs = [];
  let doneMeta = null;
  let painted = 0;

  const paint = () => {
    bubble.innerHTML = `${markdownToHtml(answerText)}<span class="typing-cursor"></span>`;
    scrollChat();
  };

  try {
    const res = await fetch(API.ask, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: q,
        mode: state.mode,
        history,
        stream: true,
        useAi: true
      }),
      signal: state.controller.signal
    });

    if (!res.ok || !res.body) {
      // عودة إلى الوضع غير المتدفق
      throw new Error(`stream-unavailable-${res.status}`);
    }

    await readSse(res, (event, data) => {
      if (event === "sources") {
        sources = data.sources || [];
        docs = data.docs || [];
        renderSources(sourcesBox, sources, docs);
        scrollChat();
      } else if (event === "token") {
        answerText += data.t || "";
        const now = performance.now();
        if (now - painted > 60) {
          painted = now;
          paint();
        }
      } else if (event === "done") {
        doneMeta = data;
      } else if (event === "error") {
        throw new Error(data.error || "خطأ في البث");
      }
    });

    if (!answerText) throw new Error("لم تُعد الإجابة أي نص");
    paint();

    if (doneMeta?.usedFallback && doneMeta?.error) {
      toast(`تعذّر المحرك الذكي (${doneMeta.error}) — تمت الإجابة بالمحرك الاستخراجي.`, "err");
    }
  } catch (err) {
    if (err.name === "AbortError") {
      bubble.innerHTML = markdownToHtml(answerText || "_تم إيقاف الإجابة._");
    } else {
      // محاولة غير متدفقة
      try {
        const data = await postJson(API.ask, { message: q, mode: state.mode, history, stream: false });
        answerText = data.answer || "";
        sources = data.sources || [];
        docs = data.docs || [];
        renderSources(sourcesBox, sources, docs);
        bubble.innerHTML = markdownToHtml(answerText);
      } catch (err2) {
        bubble.innerHTML = `<p class="muted">تعذّر تنفيذ السؤال: ${escapeHtml(err2.message || err.message)}</p>`;
        toast(err2.message || String(err.message || err), "err");
      }
    }
  } finally {
    bubble.classList.remove("typing-cursor");
    const cursor = bubble.querySelector(".typing-cursor");
    if (cursor) cursor.remove();
    state.busy = false;
    state.controller = null;
    $("send").disabled = false;
    $("stopBtn").hidden = true;

    if (answerText) {
      state.messages.push({
        role: "assistant",
        content: answerText,
        sources,
        docs,
        engineLabel: doneMeta?.provider === "extractive" ? "محرك استخراجي" : state.config?.ai?.label
      });
      renderActions(wrap, answerText);
      saveChat();
    }
    scrollChat();
    loadStats();
  }
}

/* =============================================================
   6) نافذة الفيديو (التفريغ والبحث داخل النص)
   ============================================================= */

async function openVideoModal(videoId, startMs = 0, query = "") {
  state.currentVideoId = videoId;
  const modal = $("videoModal");
  modal.hidden = false;
  $("transcript").innerHTML = `<p class="muted">جارٍ التحميل…</p>`;
  $("videoSummaryBox").hidden = true;
  $("inVideoSearch").value = query || "";

  try {
    const url = `${API.video(videoId)}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
    const data = await getJson(url);
    const v = data.video;
    $("videoModalTitle").textContent = v.title || videoId;
    const badge = v.sourceKind === "demo" ? ' • <span class="badge">بيانات تجريبية</span>' : "";
    $("videoModalMeta").innerHTML = `${data.segments.length} مقطع نصي${v.transcriptLang ? ` • اللغة: ${escapeHtml(v.transcriptLang)}` : ""}${badge}`;
    $("videoOpenLink").href = v.url || `https://www.youtube.com/watch?v=${videoId}`;

    const box = $("transcript");
    box.innerHTML = "";
    if (!data.segments.length) {
      box.innerHTML = `<p class="muted">لا يوجد نص مفهرس لهذا الفيديو${query ? " مطابق للبحث" : ""}.</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    let target = null;
    for (const s of data.segments) {
      const row = el("div", "t-row", `
        <span class="t-time" data-link="${escapeHtml(s.link)}">${escapeHtml(s.time)}</span>
        <span class="t-text">${escapeHtml(s.text)}</span>`);
      if (query) {
        const norm = (txt) => txt.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
        const idx = norm(s.text).indexOf(norm(query.split(/\s+/)[0] || ""));
        if (idx >= 0) {
          row.classList.add("hit");
          const t = row.querySelector(".t-text");
          t.innerHTML = escapeHtml(s.text.slice(0, idx)) + "<mark>" + escapeHtml(s.text.slice(idx, idx + query.length)) + "</mark>" + escapeHtml(s.text.slice(idx + query.length));
        }
      }
      if (!target && startMs && Math.abs(s.startMs - startMs) < 12000) target = row;
      frag.appendChild(row);
    }
    box.appendChild(frag);
    box.querySelectorAll(".t-time").forEach((node) => {
      node.addEventListener("click", () => window.open(node.dataset.link, "_blank", "noopener"));
    });
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.classList.add("hit");
    }
  } catch (err) {
    $("transcript").innerHTML = `<p class="muted">تعذّر تحميل النص: ${escapeHtml(err.message)}</p>`;
  }
}

async function summarizeCurrentVideo() {
  const videoId = state.currentVideoId;
  if (!videoId) return;
  const box = $("videoSummaryBox");
  box.hidden = false;
  box.innerHTML = `<span class="spinner"></span> جارٍ التلخيص…`;
  try {
    const res = await fetch(API.summarize, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(state.adminToken ? { "x-admin-token": state.adminToken } : {})
      },
      body: JSON.stringify({ videoId, stream: true })
    });
    if (!res.ok || !res.body) throw new Error("تعذّر التلخيص");
    let text = "";
    await readSse(res, (event, data) => {
      if (event === "token") {
        text += data.t || "";
        box.innerHTML = markdownToHtml(text);
      } else if (event === "error") {
        throw new Error(data.error);
      }
    });
    if (!text) box.innerHTML = `<span class="muted">لا يوجد نص كافٍ للتلخيص.</span>`;
  } catch (err) {
    box.innerHTML = `<span class="muted">تعذّر التلخيص: ${escapeHtml(err.message)}</span>`;
  }
}

/* =============================================================
   7) المكتبة والإحصاءات والتغذية
   ============================================================= */

async function loadVideos(q = "") {
  const box = $("videoList");
  try {
    const data = await getJson(`${API.videos}?limit=60${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    box.innerHTML = "";
    if (!data.videos.length) {
      box.innerHTML = `<p class="muted small">لا توجد فيديوهات بعد. افتح ⚙ ثم «ابدأ سحب القناة».</p>`;
      return;
    }
    for (const v of data.videos) {
      const item = el("button", "video-item");
      const badges = [];
      if (v.sourceKind === "demo") badges.push('<span class="badge">تجريبي</span>');
      if (v.error) badges.push('<span class="badge err">لا يوجد نص</span>');
      item.innerHTML = `
        <span class="v-title">${escapeHtml(v.title || v.id)}</span>
        <span class="v-meta">
          ${v.segmentsCount ? `<span>📄 ${v.segmentsCount} مقطع</span>` : ""}
          ${v.durationS ? `<span>⏱ ${timeText(v.durationS * 1000)}</span>` : ""}
          ${badges.join(" ")}
        </span>`;
      item.addEventListener("click", () => openVideoModal(v.id));
      box.appendChild(item);
    }
  } catch (err) {
    box.innerHTML = `<p class="muted small">تعذّر تحميل القائمة.</p>`;
  }
}

/** شريط تنبيه حالة القاعدة (فارغة / بيانات تجريبية / جاهزة) */
function renderDbNotice(s) {
  const box = $("dbNotice");
  if (!box) return;
  if (!s.segments) {
    box.hidden = false;
    box.className = "notice empty";
    box.innerHTML = `
      <span>🗄️ <b>قاعدة البيانات فارغة.</b> لم تُسحب نصوص القناة بعد، ولن تعمل الإجابات حتى تسحبها.</span>
      <span class="notice-actions">
        <button class="ghost-btn" id="noticeIngest">▶ اسحب نصوص القناة الآن</button>
        <code class="muted">npm run ingest</code>
      </span>`;
  } else if (s.demoVideos) {
    box.hidden = false;
    box.className = "notice";
    box.innerHTML = `
      <span>⚠️ تعمل الأداة الآن بـ <b>${s.demoVideos} فيديو تجريبي</b> (للتوضيح فقط) — اسحب نصوص القناة الحقيقية لتُستبدل تلقائيًا.</span>
      <span class="notice-actions">
        <button class="ghost-btn" id="noticeIngest">▶ اسحب نصوص القناة</button>
        <button class="ghost-btn" id="noticePurge">🧹 احذف التجريبية</button>
      </span>`;
  } else {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const openBtn = $("noticeIngest");
  if (openBtn) openBtn.addEventListener("click", () => ($("adminModal").hidden = false));
  const purgeBtn = $("noticePurge");
  if (purgeBtn) purgeBtn.addEventListener("click", () => $("purgeDemo").click());
}

async function loadStats() {
  try {
    const data = await getJson(API.stats);
    const s = data.stats || {};
    renderDbNotice(s);
    $("statsBox").innerHTML = `
      <div class="stat"><b>${s.videos || 0}</b><span>فيديو في القاعدة</span></div>
      <div class="stat"><b>${s.segments || 0}</b><span>مقطع نصي مفهرس</span></div>
      <div class="stat"><b>${(s.chars || 0).toLocaleString("ar-EG")}</b><span>حرف مفرَّغ</span></div>
      <div class="stat"><b>${s.hours || 0}</b><span>ساعة مصدر</span></div>
      ${s.demoVideos ? `<div class="stat" style="grid-column:1/-1"><b>${s.demoVideos}</b><span>فيديو بيانات تجريبية — احذفها من ⚙</span></div>` : ""}`;
    $("dbChip").hidden = !s.segments;
    $("dbLabel").textContent = `${s.videosWithTranscript || 0} فيديو • ${s.segments || 0} مقطع`;
  } catch (_) {
    /* تجاهل */
  }
}

async function loadConfig() {
  try {
    const cfg = await getJson(API.config);
    state.config = cfg;
    document.title = `${cfg.app.name} | ${cfg.app.tagline}`;
    $("brandTagline").textContent = cfg.app.tagline;
    $("channelChip").href = cfg.channel.url;
    $("channelLabel").textContent = cfg.channel.title ? `قناة: ${cfg.channel.title}` : "القناة المصدر";
    const ai = cfg.ai || {};
    $("aiLabel").textContent = ai.enabled ? `${ai.label}` : "محفّز استخراجي (بدون مفتاح)";
    $("aiDot").className = `dot ${ai.enabled ? "on" : "off"}`;
    $("aiChip").title = ai.enabled
      ? `محرك الذكاء: ${ai.label} — الموديل ${ai.model}`
      : "لا يوجد مفتاح API؛ ستعمل الأداة بالمحرك الاستخراجي (نصوص القناة مباشرة).";

    const suggestions = [
      "ما حكم صلاة الجماعة وما أدلتها من القناة؟",
      "اشرح لي مسألة زكاة الفطر: مقدارها ووقتها",
      "ما الفرق بين الحديث الصحيح والحسن والضعيف؟",
      "ما ضوابط المعاملات المصرفية والربا؟",
      "ما معنى الآية الكريمة في هذه المسألة؟",
      "ما مسائل الطهارة التي يكثر السؤال عنها؟"
    ];
    const box = $("suggestions");
    box.innerHTML = "";
    for (const s of suggestions) {
      const b = el("button", "suggestion", escapeHtml(s));
      b.addEventListener("click", () => ask(s));
      box.appendChild(b);
    }

    const cards = [
      { t: "فقه العبادات", d: "الطهارة • الصلاة • الصيام • الزكاة • الحج" },
      { t: "المعاملات المالية", d: "الربا • البيع • البنوك • العملات • العقود" },
      { t: "الأسرة والأحكام", d: "الزواج • الطلاق • النفقة • الميراث • الآداب" },
      { t: "الحديث والعقيدة", d: "التخريج والدرجة • التوحيد • الأسماء والصفات" }
    ];
    const wc = $("welcomeCards");
    if (wc) {
      wc.innerHTML = cards
        .map((c) => `<div class="wcard"><strong>${escapeHtml(c.t)}</strong><span>${escapeHtml(c.d)}</span></div>`)
        .join("");
    }
  } catch (err) {
    toast("تعذّر تحميل إعدادات الخادم", "err");
  }
}

function welcomeMarkup() {
  return `
    <section class="welcome" id="welcome">
      <div class="welcome-mark">﷽</div>
      <h2>اسأل في أي باب من أبواب العلم الشرعي</h2>
      <p>يجيبك «مشكاة» من نصوص القناة العلمية المفرَّغة، ويعرض لك <strong>النص</strong> و<strong>توقيته</strong>
      و<strong>رابط الفيديو</strong> مباشرة، ويوسّع المجال بمسائل متصلة عند الحاجة.</p>
      <div class="welcome-cards" id="welcomeCards"></div>
      <p class="welcome-note">تنبيه: الأداة للاستفادة العلمية وليست جهة إفتاء رسمية، والمسائل الشخصية تُرجع إلى أهل العلم.</p>
    </section>`;
}

function bindWelcome() {
  loadConfig();
}

/* ---------- التغذية (Ingest) ---------- */

async function runIngest({ videoId = null, limit = 0, force = false } = {}) {
  const logBox = $("ingestLog");
  logBox.innerHTML = "";
  const append = (text, cls = "") => {
    const line = el("div", cls, escapeHtml(text));
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  };

  append(videoId ? `بدء سحب الفيديو ${videoId}…` : "بدء سحب نصوص القناة…");

  try {
    const res = await fetch(API.ingest, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(state.adminToken ? { "x-admin-token": state.adminToken } : {})
      },
      body: JSON.stringify({ videoId, limit, force, stream: true })
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `خطأ ${res.status}`);
    }

    await readSse(res, (event, data) => {
      if (event === "progress") {
        if (data.message) {
          const cls = data.status === "ok" ? "ok" : data.status === "failed" ? "fail" : data.status === "skipped" ? "skip" : "";
          append(data.message, cls);
        } else if (data.phase === "listing" && data.count) {
          append(`… تم سرد ${data.count} فيديو`);
        }
      } else if (event === "done") {
        const s = data.summary || {};
        append("");
        append(`انتهى: ${s.ok || 0} نجح • ${s.skipped || 0} متخطى • ${s.failed || 0} فشل • ${s.chunks || 0} مقطع جديد`, "ok");
      } else if (event === "error") {
        append(`خطأ: ${data.error}`, "fail");
      }
    });

    toast("تمت عملية السحب", "ok");
    await Promise.all([loadStats(), loadVideos($("videoSearch").value)]);
  } catch (err) {
    append(`تعذّر السحب: ${err.message}`, "fail");
    toast(err.message, "err");
  }
}

/* =============================================================
   8) التخزين المحلي والربط
   ============================================================= */

function saveChat() {
  try {
    const slim = state.messages.slice(-24).map((m) => ({
      role: m.role,
      content: m.content,
      sources: (m.sources || []).slice(0, 8),
      docs: m.docs || [],
      engineLabel: m.engineLabel
    }));
    localStorage.setItem("mishkat_chat", JSON.stringify(slim));
  } catch (_) {
    /* تجاهل */
  }
}

function loadChat() {
  try {
    const raw = localStorage.getItem("mishkat_chat");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) state.messages = data;
  } catch (_) {
    state.messages = [];
  }
}

function bindEvents() {
  // إرسال
  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = $("input").value.trim();
    if (!value) return;
    $("input").value = "";
    autoGrow();
    ask(value);
  });

  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("composer").dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });
  $("input").addEventListener("input", autoGrow);

  $("stopBtn").addEventListener("click", () => {
    state.controller?.abort();
    toast("تم إيقاف الإجابة");
  });

  // محادثة جديدة
  $("newChatBtn").addEventListener("click", () => {
    if (state.busy) state.controller?.abort();
    state.messages = [];
    saveChat();
    renderHistory();
    toast("بدأت محادثة جديدة", "ok");
  });

  // الأوضاع
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.mode = radio.value;
      toast(`تم التبديل إلى ${modeLabel(state.mode)}`, "ok");
      $("composerHint").textContent =
        state.mode === "open"
          ? "وضع واسع المجال: الإجابة تستفيض في المسائل المتصلة والمذاهب والنوازل مع تمييز ما ليس من نصوص القناة."
          : state.mode === "strict"
          ? "وضع صارم: لا يُجاب إلا بنصوص القناة، ويُصرَّح عند عدم وجود نص."
          : "الإجابة تُبنى على نصوص القناة، مع توسيع بمسائل متصلة عند الحاجة.";
    });
  });

  // الشريط الجانبي
  $("menuBtn").addEventListener("click", () => document.body.classList.toggle("side-open"));
  $("overlay").addEventListener("click", () => document.body.classList.remove("side-open"));

  // البحث في المكتبة
  let timer = null;
  $("videoSearch").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadVideos(e.target.value.trim()), 300);
  });

  // النوافذ
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = $(btn.dataset.close);
      if (modal) modal.hidden = true;
    });
  });
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
  });

  // فتح نص الفيديو من بطاقة مصدر
  $("chat").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-video]");
    if (btn) openVideoModal(btn.dataset.openVideo, Number(btn.dataset.start || 0));
  });

  $("summarizeBtn").addEventListener("click", summarizeCurrentVideo);
  $("inVideoSearchBtn").addEventListener("click", () => {
    if (state.currentVideoId) openVideoModal(state.currentVideoId, 0, $("inVideoSearch").value.trim());
  });
  $("inVideoSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state.currentVideoId) {
      openVideoModal(state.currentVideoId, 0, $("inVideoSearch").value.trim());
    }
  });

  // الإدارة
  $("adminBtn").addEventListener("click", () => {
    $("adminModal").hidden = false;
    $("adminToken").value = state.adminToken;
  });
  $("adminToken").addEventListener("change", (e) => {
    state.adminToken = e.target.value.trim();
    sessionStorage.setItem("mishkat_admin_token", state.adminToken);
  });
  $("startIngest").addEventListener("click", () =>
    runIngest({
      limit: Number($("ingestLimit").value || 0),
      force: $("ingestForce").value === "yes"
    })
  );
  $("startSingle").addEventListener("click", () => {
    const raw = $("singleVideoUrl").value.trim();
    if (!raw) return toast("ألصق رابط الفيديو أو معرّفه", "err");
    const match = raw.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{6,})/) || raw.match(/^([\w-]{6,})$/);
    const id = match ? match[1] : raw;
    runIngest({ videoId: id });
  });
  $("purgeDemo").addEventListener("click", async () => {
    if (!confirm("حذف كل البيانات التجريبية من القاعدة؟")) return;
    try {
      const data = await postJson(API.purgeDemo, { token: state.adminToken });
      toast(`تم حذف ${data.removed || 0} فيديو تجريبي`, "ok");
      await Promise.all([loadStats(), loadVideos()]);
    } catch (err) {
      toast(err.message, "err");
    }
  });
}

function autoGrow() {
  const ta = $("input");
  ta.style.height = "auto";
  ta.style.height = `${Math.min(190, ta.scrollHeight)}px`;
}

/* =============================================================
   9) الإقلاع
   ============================================================= */

async function init() {
  loadChat();
  bindEvents();
  renderHistory();
  await loadConfig();
  await Promise.all([loadStats(), loadVideos()]);
  // إعادة ربط البطاقات بعد استعادة المحادثة
  if (state.config?.ai) {
    $("aiLabel").textContent = state.config.ai.enabled ? state.config.ai.label : "محرك استخراجي";
  }
}

init();
