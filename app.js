"use strict";

/* T.M.D AI - stable client controller
   Keeps the existing HTML/CSS and /api/chat contract intact. */

const $ = (id) => document.getElementById(id);

const els = {
  input: $("input"),
  send: $("send"),
  plus: $("plusButton"),
  menu: $("plusMenu"),
  imageButton: $("addImageButton"),
  fileButton: $("analyzeDocumentButton"),
  editButton: $("imageEditButton"),
  imageInput: $("imageInput"),
  documentInput: $("documentInput"),
  preview: $("attachmentPreview"),
  attachmentIcon: $("attachmentIcon"),
  attachmentName: $("attachmentName"),
  attachmentMeta: $("attachmentMeta"),
  chat: $("chat"),
  welcome: $("welcome"),
  history: $("history"),
  newChat: $("newChat"),
  clearChat: $("clearChat"),
  theme: $("themeButton"),
  model: $("modelSelect"),
  zone: $("chatZone"),
  toast: $("toast")
};

const STORAGE = {
  messages: "tmd_messages",
  conversations: "tmd_conversations",
  theme: "tmd_theme",
  model: "tmd_model"
};

const state = {
  messages: loadJSON(STORAGE.messages, []),
  conversations: loadJSON(STORAGE.conversations, []),
  theme: localStorage.getItem(STORAGE.theme) || "dark",
  model: localStorage.getItem(STORAGE.model) || "openai/gpt-oss-120b",
  selectedImage: null,
  selectedDocument: null,
  imageMode: false,
  busy: false,
  controller: null
};

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveState() {
  try {
    // Never persist base64 images or large attachment data.
    const safe = state.messages.slice(-50).map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.slice(0, 12000) : (m.displayText || "")
    }));
    localStorage.setItem(STORAGE.messages, JSON.stringify(safe));
  } catch (_) {}
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderText(text) {
  const safe = escapeHTML(text);
  return safe
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function showToast(message, duration = 3200) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), duration);
}

function setTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = state.theme;
  localStorage.setItem(STORAGE.theme, state.theme);
  if (els.theme) {
    els.theme.textContent = state.theme === "dark" ? "☀" : "☾";
    els.theme.title = state.theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن";
  }
}

function closePlusMenu() {
  if (!els.menu || !els.plus) return;
  els.menu.classList.add("hidden");
  els.plus.setAttribute("aria-expanded", "false");
}

function togglePlusMenu(event) {
  if (event) event.preventDefault();
  if (!els.menu || !els.plus) return;
  const hidden = els.menu.classList.contains("hidden");
  if (hidden) {
    els.menu.classList.remove("hidden");
    els.plus.setAttribute("aria-expanded", "true");
  } else closePlusMenu();
}

function clearAttachment() {
  state.selectedImage = null;
  state.selectedDocument = null;
  state.imageMode = false;
  if (els.imageInput) els.imageInput.value = "";
  if (els.documentInput) els.documentInput.value = "";
  if (els.preview) els.preview.classList.add("hidden");
}

function setAttachment(file, kind) {
  if (!file) return;
  if (kind === "image") {
    state.selectedImage = file;
    state.selectedDocument = null;
    state.imageMode = true;
    if (els.attachmentIcon) els.attachmentIcon.textContent = "🖼️";
  } else {
    state.selectedDocument = file;
    state.selectedImage = null;
    state.imageMode = false;
    if (els.attachmentIcon) els.attachmentIcon.textContent = "📎";
  }
  if (els.attachmentName) els.attachmentName.textContent = file.name;
  if (els.attachmentMeta) els.attachmentMeta.textContent = formatBytes(file.size);
  if (els.preview) els.preview.classList.remove("hidden");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("الملف المحدد ليس صورة.");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("حجم الصورة أكبر من 20MB.");
  }

  const dataURL = await fileToDataURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = dataURL;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("تعذر قراءة الصورة على هذا الجهاز."));
  });

  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("تعذر تجهيز الصورة.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.60;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > 2.2 * 1024 * 1024 && quality > 0.30) {
    quality -= 0.10;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  if (!result || result.length < 100) throw new Error("تعذر ضغط الصورة.");
  return result;
}

function limitText(text, max = 6500) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max) + "\n\n[تم اختصار الملف تلقائيًا]" : value;
}

async function extractDocument(file) {
  const name = file.name.toLowerCase();
  const textExt = [".txt", ".md", ".js", ".json", ".html", ".css", ".py", ".csv", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".sql", ".xml", ".yml", ".yaml", ".sh", ".log"];
  if (textExt.some(ext => name.endsWith(ext))) return limitText(await file.text(), 7000);

  if (name.endsWith(".pdf")) {
    if (!window.pdfjsLib && window.pdfjsReady) await window.pdfjsReady;
    if (!window.pdfjsLib) throw new Error("مكتبة PDF غير متاحة. أعد تحميل الصفحة.");
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(`--- الصفحة ${i} ---\n${content.items.map(item => item.str).join(" ")}`);
      if (pages.join("\n\n").length > 7000) break;
    }
    return limitText(pages.join("\n\n"), 7000);
  }

  if (name.endsWith(".docx")) {
    if (!window.mammoth) throw new Error("مكتبة DOCX غير متاحة. أعد تحميل الصفحة.");
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return limitText(result.value, 7000);
  }

  throw new Error("نوع الملف غير مدعوم.");
}

function compactHistory(messages, maxChars) {
  const result = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    const text = m.content.trim();
    if (total + text.length > maxChars) break;
    result.unshift({ role: m.role, content: text.slice(0, 5000) });
    total += text.length;
  }
  return result;
}

async function buildRequest(userText) {
  if (state.selectedImage) {
    const image = await prepareImage(state.selectedImage);
    const history = compactHistory(state.messages, 2800);
    history.push({
      role: "user",
      content: [
        { type: "text", text: userText || "حلل هذه الصورة واذكر أهم ما تراه." },
        { type: "image_url", image_url: { url: image } }
      ]
    });
    return { messages: history, displayText: userText || "تحليل الصورة", imageData: image, fileName: state.selectedImage.name };
  }

  if (state.selectedDocument) {
    const content = await extractDocument(state.selectedDocument);
    const history = compactHistory(state.messages, 3500);
    history.push({
      role: "user",
      content: `${userText || "حلل الملف المرفق وقدم أهم المعلومات."}\n\nاسم الملف: ${state.selectedDocument.name}\n\nمحتوى الملف:\n${content}`
    });
    return { messages: history, displayText: userText || `تحليل الملف: ${state.selectedDocument.name}`, fileName: state.selectedDocument.name };
  }

  const history = compactHistory(state.messages, 9000);
  history.push({ role: "user", content: userText });
  return { messages: history, displayText: userText };
}

function renderMessages() {
  if (!els.chat) return;
  els.chat.innerHTML = "";
  if (els.welcome) els.welcome.classList.toggle("hidden", state.messages.length > 0);

  state.messages.forEach((m) => {
    const row = document.createElement("div");
    row.className = `message ${m.role === "user" ? "user" : "assistant"}`;
    const inner = document.createElement("div");
    inner.className = "message-inner";
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = m.role === "user" ? "أنت" : "T.M.D";
    const content = document.createElement("div");
    content.className = "message-content";

    if (m.imageData) {
      const img = document.createElement("img");
      img.className = "message-image";
      img.src = m.imageData;
      img.alt = "الصورة المرفقة";
      img.loading = "lazy";
      content.appendChild(img);
    }
    if (m.fileName) {
      const file = document.createElement("div");
      file.className = "message-file";
      file.textContent = `📎 ${m.fileName}`;
      content.appendChild(file);
    }
    if (m.content) {
      const text = document.createElement("div");
      text.innerHTML = renderText(m.content);
      content.appendChild(text);
    }
    inner.append(avatar, content);
    row.appendChild(inner);
    els.chat.appendChild(row);
  });
  requestAnimationFrame(() => { if (els.zone) els.zone.scrollTop = els.zone.scrollHeight; });
}

function addMessage(role, content, extra = {}) {
  state.messages.push({ role, content: String(content || ""), ...extra });
  saveState();
  renderMessages();
}

function setBusy(busy) {
  state.busy = busy;
  if (!els.send) return;
  els.send.classList.toggle("stop", busy);
  els.send.textContent = busy ? "■" : "➤";
  els.send.setAttribute("aria-label", busy ? "إيقاف" : "إرسال");
}

async function sendMessage() {
  if (state.busy) {
    if (state.controller) state.controller.abort();
    return;
  }

  const text = (els.input?.value || "").trim();
  if (!text && !state.selectedImage && !state.selectedDocument) return;

  setBusy(true);
  closePlusMenu();
  if (els.input) els.input.disabled = true;

  try {
    const request = await buildRequest(text);
    addMessage("user", request.displayText, {
      imageData: request.imageData || null,
      fileName: request.fileName || null
    });

    const controller = new AbortController();
    state.controller = controller;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ model: state.model, messages: request.messages }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `حدث خطأ (${response.status})`);

    addMessage("assistant", data.reply || "لم تصل إجابة.");
    if (els.input) els.input.value = "";
    clearAttachment();
    autoResize();
  } catch (error) {
    if (error.name === "AbortError") return;
    showToast(error.message || "تعذر إرسال الرسالة.", 5000);
  } finally {
    state.controller = null;
    setBusy(false);
    if (els.input) {
      els.input.disabled = false;
      els.input.focus();
    }
  }
}

function autoResize() {
  if (!els.input) return;
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(160, Math.max(42, els.input.scrollHeight))}px`;
}

function newChat() {
  state.messages = [];
  clearAttachment();
  saveState();
  renderMessages();
  closePlusMenu();
  if (els.input) { els.input.value = ""; autoResize(); els.input.focus(); }
}

function renderHistory() {
  if (!els.history) return;
  els.history.innerHTML = "";
  state.conversations.slice(-20).reverse().forEach((item, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item";
    btn.textContent = item.title || `محادثة ${index + 1}`;
    btn.addEventListener("click", () => {
      state.messages = Array.isArray(item.messages) ? item.messages : [];
      saveState();
      renderMessages();
    });
    els.history.appendChild(btn);
  });
}

function saveConversationBeforeNewChat() {
  if (!state.messages.length) return;
  const first = state.messages.find(m => m.role === "user");
  const title = (first?.content || "محادثة جديدة").slice(0, 50);
  state.conversations.push({ title, messages: state.messages.slice(-50), time: Date.now() });
  state.conversations = state.conversations.slice(-20);
  try { localStorage.setItem(STORAGE.conversations, JSON.stringify(state.conversations)); } catch (_) {}
}

function setup() {
  setTheme(state.theme);
  if (els.model) {
    const valid = Array.from(els.model.options).some(o => o.value === state.model);
    els.model.value = valid ? state.model : els.model.options[0]?.value || "openai/gpt-oss-120b";
    state.model = els.model.value;
    els.model.addEventListener("change", () => {
      state.model = els.model.value;
      localStorage.setItem(STORAGE.model, state.model);
    });
  }

  els.plus?.addEventListener("click", togglePlusMenu);
  els.imageButton?.addEventListener("click", (e) => { e.preventDefault(); closePlusMenu(); state.imageMode = true; els.imageInput?.click(); });
  els.fileButton?.addEventListener("click", (e) => { e.preventDefault(); closePlusMenu(); state.imageMode = false; els.documentInput?.click(); });
  els.editButton?.addEventListener("click", (e) => { e.preventDefault(); closePlusMenu(); state.imageMode = true; els.imageInput?.click(); });

  els.imageInput?.addEventListener("change", () => {
    const file = els.imageInput.files?.[0];
    if (file) setAttachment(file, "image");
  });
  els.documentInput?.addEventListener("change", () => {
    const file = els.documentInput.files?.[0];
    if (file) setAttachment(file, "document");
  });

  els.preview?.querySelector("[data-remove]")?.addEventListener("click", clearAttachment);
  els.send?.addEventListener("click", (e) => { e.preventDefault(); sendMessage(); });

  els.input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.input?.addEventListener("input", autoResize);

  els.theme?.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
  els.newChat?.addEventListener("click", () => { saveConversationBeforeNewChat(); newChat(); renderHistory(); });
  els.clearChat?.addEventListener("click", () => { saveConversationBeforeNewChat(); newChat(); renderHistory(); });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".plus-menu-wrapper")) closePlusMenu();
  });

  // Mobile browsers can retain focus/zoom after navigation; this keeps the composer usable.
  window.addEventListener("pageshow", () => { setBusy(false); if (els.input) els.input.disabled = false; });
  window.addEventListener("online", () => showToast("تم استعادة الاتصال بالإنترنت."));
  window.addEventListener("offline", () => showToast("لا يوجد اتصال بالإنترنت."));

  renderMessages();
  renderHistory();
  autoResize();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
else setup();
