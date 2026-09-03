const DEFAULT_SETTINGS = {
  siteName: "T.M.D AI",
  siteDescription: "المساعد الذكي",
  developerName: "ياسين عمرو عبد الرحيم",
  primaryColor: "#c9a227",
  secondaryColor: "#ffffff",
  backgroundColor: "#faf8f1",
  textColor: "#1b1a17",
  panelColor: "#ffffff",
  borderColor: "#ded5b7",
  logoText: "T",
  logoUrl: "",
  faviconUrl: "",
  backgroundImage: "",
  showWelcome: true,
  showSuggestions: true,
  showDeveloper: true,
  enableImageTools: true,
  sidebarIconColor: "#c9a227",
  sendButtonText: "➤",
  suggestions: [
    { title:"شرح الذكاء الاصطناعي", icon:"🤖", prompt:"اشرح لي الذكاء الاصطناعي بطريقة بسيطة" },
    { title:"اكتب كود", icon:"💻", prompt:"اكتب لي كود HTML احترافي" },
    { title:"حل مسألة", icon:"🧮", prompt:"حل لي هذه المسألة خطوة بخطوة" },
    { title:"سؤال ديني", icon:"📖", prompt:"أجب عن هذا السؤال الديني مع ذكر المصادر الموثوقة، ووضح إن كان هناك اختلاف بين العلماء." }
  ]
};

const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  busy: false,
  selectedImage: null,
  imageMode: "analyze",
  ownerToken: sessionStorage.getItem("tmd_owner_token") || "",
  settings: { ...DEFAULT_SETTINGS }
};

const $ = (id) => document.getElementById(id);

const chat = $("chat");
const input = $("input");
const composer = $("composer");
const send = $("send");
const welcome = $("welcome");

const sidebar = $("sidebar");
const overlay = $("overlay");
const plusButton = $("plusButton");
const plusMenu = $("plusMenu");
const imageInput = $("imageInput");
const imageUploadButton = $("imageUploadButton");
const imageEditButton = $("imageEditButton");
const imagePreview = $("imagePreview");
const previewImage = $("previewImage");
const removeImage = $("removeImage");

const ownerButton = $("ownerButton");
const ownerModal = $("ownerModal");
const closeOwnerModal = $("closeOwnerModal");
const ownerLoginSection = $("ownerLoginSection");
const ownerPanelSection = $("ownerPanelSection");
const ownerLoginForm = $("ownerLoginForm");
const ownerPassword = $("ownerPassword");
const ownerLoginError = $("ownerLoginError");
const ownerLogout = $("ownerLogout");
const saveSettingsButton = $("saveSettings");
const settingsMessage = $("settingsMessage");

const settingSiteName = $("settingSiteName");
const settingDescription = $("settingDescription");
const settingDeveloper = $("settingDeveloper");
const settingPrimaryColor = $("settingPrimaryColor");
const settingTextColor = $("settingTextColor");
const settingBackgroundColor = $("settingBackgroundColor");
const settingPanelColor = $("settingPanelColor");
const settingBorderColor = $("settingBorderColor");
const settingSidebarIconColor = $("settingSidebarIconColor");
const settingLogoText = $("settingLogoText");
const settingLogoUrl = $("settingLogoUrl");
const settingFaviconUrl = $("settingFaviconUrl");
const settingBackgroundImage = $("settingBackgroundImage");
const settingShowWelcome = $("settingShowWelcome");
const settingShowSuggestions = $("settingShowSuggestions");
const settingShowDeveloper = $("settingShowDeveloper");
const settingEnableImageTools = $("settingEnableImageTools");
const logoFileInput = $("logoFileInput");
const backgroundFileInput = $("backgroundFileInput");

function saveMessages() {
  localStorage.setItem("tmd_messages", JSON.stringify(state.messages));
}

function scrollBottom() {
  requestAnimationFrame(() => {
    if (chat) chat.scrollTop = chat.scrollHeight;
  });
}

function addMessage(role, text, isError = false) {
  const row = document.createElement("div");
  row.className = `message-row ${role}${isError ? " error" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";

  if (role === "user") {
    avatar.textContent = "أنت";
  } else if (state.settings.logoUrl) {
    const img = document.createElement("img");
    img.src = state.settings.logoUrl;
    img.alt = "";
    avatar.appendChild(img);
  } else {
    avatar.textContent = state.settings.logoText || "T";
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (role === "user") row.append(bubble, avatar);
  else row.append(avatar, bubble);

  chat.appendChild(row);
  scrollBottom();
  return row;
}

function render() {
  chat.querySelectorAll(".message-row").forEach((el) => el.remove());

  if (welcome) {
    welcome.style.display =
      state.messages.length || !state.settings.showWelcome
        ? "none"
        : "grid";
  }

  state.messages.forEach((message) => {
    addMessage(message.role, message.content);
  });
}

function setBusy(value) {
  state.busy = Boolean(value);
  if (send) {
    send.disabled = state.busy;
    send.textContent = state.busy ? "…" : (state.settings.sendButtonText || "➤");
  }
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "message-row assistant";
  row.innerHTML = `
    <div class="avatar">${escapeHtml(state.settings.logoText || "T")}</div>
    <div class="bubble typing">
      <span></span><span></span><span></span>
    </div>
  `;
  chat.appendChild(row);
  scrollBottom();
  return row;
}

async function sendMessage(text) {
  const message = String(text || "").trim();

  if (!message || state.busy) return;

  state.messages.push({
    role: "user",
    content: message
  });

  saveMessages();
  render();

  input.value = "";
  resizeInput();
  setBusy(true);

  const typing = showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.messages
      })
    });

    const data = await response.json().catch(() => ({}));
    typing.remove();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    state.messages.push({
      role: "assistant",
      content: data.message
    });

    saveMessages();
    render();
  } catch (error) {
    typing.remove();
    addMessage(
      "assistant",
      `حدث خطأ: ${error.message || "تعذر الاتصال بالخادم."}`,
      true
    );
  } finally {
    setBusy(false);
    input.focus();
  }
}

function togglePlusMenu() {
  if (!plusMenu) return;

  const open = plusMenu.classList.toggle("show");
  plusMenu.setAttribute("aria-hidden", open ? "false" : "true");
  plusButton?.setAttribute("aria-expanded", open ? "true" : "false");
}

function openImagePicker(mode) {
  if (!state.settings.enableImageTools) return;

  state.imageMode = mode;
  plusMenu?.classList.remove("show");
  plusMenu?.setAttribute("aria-hidden", "true");

  if (imageInput) {
    imageInput.value = "";
    imageInput.click();
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("تعذر قراءة الصورة."));

    reader.readAsDataURL(file);
  });
}

async function handleImageSelection(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowed.includes(file.type)) {
    alert("نوع الصورة غير مدعوم.");
    return;
  }

  if (file.size > 6 * 1024 * 1024) {
    alert("حجم الصورة يجب ألا يتجاوز 6MB.");
    return;
  }

  try {
    const dataUrl = await readImageFile(file);

    state.selectedImage = {
      file,
      dataUrl
    };

    if (previewImage) previewImage.src = dataUrl;
    if (imagePreview) imagePreview.hidden = false;

    await analyzeSelectedImage();
  } catch (error) {
    showError(error.message || "تعذر التعامل مع الصورة.");
  }
}

async function analyzeSelectedImage() {
  if (!state.selectedImage || state.busy) return;

  const prompt =
    input.value.trim() ||
    (
      state.imageMode === "edit"
        ? "حلل الصورة واقترح تعديلات احترافية عليها بالتفصيل، واذكر ما يجب تغييره وما يجب الحفاظ عليه."
        : "حلل هذه الصورة بالتفصيل، واستخرج أي نص واضح فيها، واذكر أهم العناصر والألوان والمعلومات الظاهرة."
    );

  input.value = "";
  resizeInput();

  setBusy(true);

  const userRow = document.createElement("div");
  userRow.className = "message-row user";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "أنت";

  const bubble = document.createElement("div");
  bubble.className = "bubble image-message";

  const image = document.createElement("img");
  image.src = state.selectedImage.dataUrl;
  image.alt = "الصورة المرسلة";

  const caption = document.createElement("div");
  caption.textContent = prompt;

  bubble.append(image, caption);
  userRow.append(bubble, avatar);
  chat.appendChild(userRow);
  scrollBottom();

  const typing = showTyping();

  try {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: state.selectedImage.dataUrl,
        prompt,
        mode: state.imageMode
      })
    });

    const data = await response.json().catch(() => ({}));
    typing.remove();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    addMessage("assistant", data.message);
  } catch (error) {
    typing.remove();

    showError(
      `تعذر تحليل الصورة: ${error.message || "خطأ غير معروف."}`
    );
  } finally {
    setBusy(false);
    removeSelectedImage();
    input.focus();
  }
}

function removeSelectedImage() {
  state.selectedImage = null;

  if (imagePreview) imagePreview.hidden = true;
  if (previewImage) previewImage.src = "";
  if (imageInput) imageInput.value = "";
}

function applySettings(incoming) {
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(incoming || {})
  };

  const s = state.settings;

  const root = document.documentElement;

  root.style.setProperty("--accent", s.primaryColor);
  root.style.setProperty("--accent2", s.secondaryColor);
  root.style.setProperty("--bg", s.backgroundColor);
  root.style.setProperty("--text", s.textColor);
  root.style.setProperty("--panel", s.panelColor);
  root.style.setProperty("--border", s.borderColor);
  root.style.setProperty("--icon", s.sidebarIconColor);

  if (s.backgroundImage) {
    document.body.style.backgroundImage =
      `url("${escapeCssUrl(s.backgroundImage)}")`;
  } else {
    document.body.style.backgroundImage = "";
  }

  setText("siteName", s.siteName);
  setText("topSiteName", s.siteName);
  setText("welcomeSiteName", s.siteName);
  setText("siteDescription", s.siteDescription);
  setText("welcomeDescription", s.siteDescription);
  setText("developer", s.showDeveloper ? `المطور: ${s.developerName}` : "");

  const brandIcon = $("brandIcon");
  const welcomeLogo = $("welcomeLogo");

  if (s.logoUrl) {
    brandIcon.innerHTML = `<img src="${escapeHtml(s.logoUrl)}" alt="">`;
    welcomeLogo.innerHTML = `<img src="${escapeHtml(s.logoUrl)}" alt="">`;
  } else {
    brandIcon.textContent = s.logoText || "T";
    welcomeLogo.textContent = s.logoText || "T";
  }

  if ($("favicon")) {
    $("favicon").href = s.faviconUrl || s.logoUrl || "";
  }

  document.title = s.siteName || "T.M.D AI";

  renderSuggestions();

  $("ownerButton").style.display = "";
  $("plusButton").style.display = s.enableImageTools
    ? "inline-flex"
    : "none";

  render();
}

function renderSuggestions() {
  const container = $("suggestions");
  const welcomeCards = $("welcomeCards");

  if (!container || !welcomeCards) return;

  container.innerHTML = "";
  welcomeCards.innerHTML = "";

  const list = Array.isArray(state.settings.suggestions)
    ? state.settings.suggestions
    : [];

  list.forEach((item) => {
    const button = document.createElement("button");
    button.className = "suggestion";
    button.dataset.prompt = item.prompt || "";
    button.textContent = `${item.icon || "•"} ${item.title || "اقتراح"}`;
    container.appendChild(button);
  });

  list.slice(0, 4).forEach((item) => {
    const button = document.createElement("button");
    button.dataset.prompt = item.prompt || "";
    button.textContent = item.title || "اقتراح";
    welcomeCards.appendChild(button);
  });

  if (!state.settings.showSuggestions) {
    container.style.display = "none";
    welcomeCards.style.display = "none";
  } else {
    container.style.display = "";
    welcomeCards.style.display = "";
  }

  bindPromptButtons();
}

function bindPromptButtons() {
  document
    .querySelectorAll("[data-prompt]")
    .forEach((button) => {
      button.onclick = () => {
        input.value = button.dataset.prompt || "";
        input.focus();
        resizeInput();
      };
    });
}

async function loadSettings() {
  try {
    const response = await fetch("/api/settings", {
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.ok && data.settings) {
      applySettings(data.settings);
      return;
    }
  } catch (error) {
    console.warn("Settings request failed:", error);
  }

  applySettings(DEFAULT_SETTINGS);
}

function openOwnerPanel() {
  if (!ownerModal) return;

  ownerModal.hidden = false;

  if (state.ownerToken) {
    showOwnerPanel();
    loadOwnerSettings();
  } else {
    showOwnerLogin();
  }
}

function closeOwnerPanel() {
  if (ownerModal) ownerModal.hidden = true;
}

function showOwnerLogin() {
  ownerLoginSection.hidden = false;
  ownerPanelSection.hidden = true;
}

function showOwnerPanel() {
  ownerLoginSection.hidden = true;
  ownerPanelSection.hidden = false;
}

async function loginOwner(event) {
  event.preventDefault();

  const password = ownerPassword?.value.trim();

  if (!password) {
    setOwnerError("أدخل كلمة مرور المالك.");
    return;
  }

  setOwnerError("");

  try {
    const response = await fetch("/api/owner-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "بيانات الدخول غير صحيحة.");
    }

    state.ownerToken = data.token;
    sessionStorage.setItem("tmd_owner_token", state.ownerToken);

    ownerPassword.value = "";

    showOwnerPanel();
    await loadOwnerSettings();
  } catch (error) {
    setOwnerError(error.message || "تعذر تسجيل الدخول.");
  }
}

function setOwnerError(message) {
  ownerLoginError.textContent = message || "";
}

async function loadOwnerSettings() {
  try {
    const response = await fetch("/api/settings", {
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) return;

    fillSettingsForm({
      ...DEFAULT_SETTINGS,
      ...(data.settings || {})
    });
  } catch (error) {
    console.error("Load owner settings error:", error);
  }
}

function fillSettingsForm(settings) {
  settingSiteName.value = settings.siteName || "";
  settingDescription.value = settings.siteDescription || "";
  settingDeveloper.value = settings.developerName || "";
  settingPrimaryColor.value = settings.primaryColor || "#c9a227";
  settingTextColor.value = settings.textColor || "#1b1a17";
  settingBackgroundColor.value = settings.backgroundColor || "#faf8f1";
  settingPanelColor.value = settings.panelColor || "#ffffff";
  settingBorderColor.value = settings.borderColor || "#ded5b7";
  settingSidebarIconColor.value = settings.sidebarIconColor || "#c9a227";
  settingLogoText.value = settings.logoText || "T";
  settingLogoUrl.value = settings.logoUrl || "";
  settingFaviconUrl.value = settings.faviconUrl || "";
  settingBackgroundImage.value = settings.backgroundImage || "";
  settingShowWelcome.checked = settings.showWelcome !== false;
  settingShowSuggestions.checked = settings.showSuggestions !== false;
  settingShowDeveloper.checked = settings.showDeveloper !== false;
  settingEnableImageTools.checked = settings.enableImageTools !== false;
}

async function saveOwnerSettings() {
  if (!state.ownerToken) {
    showSettingsMessage("يجب تسجيل دخول المالك أولاً.", true);
    return;
  }

  const settings = {
    siteName: settingSiteName.value.trim() || DEFAULT_SETTINGS.siteName,
    siteDescription:
      settingDescription.value.trim() || DEFAULT_SETTINGS.siteDescription,
    developerName:
      settingDeveloper.value.trim() || DEFAULT_SETTINGS.developerName,
    primaryColor: settingPrimaryColor.value,
    secondaryColor: "#ffffff",
    backgroundColor: settingBackgroundColor.value,
    textColor: settingTextColor.value,
    panelColor: settingPanelColor.value,
    borderColor: settingBorderColor.value,
    sidebarIconColor: settingSidebarIconColor.value,
    logoText: settingLogoText.value.trim() || "T",
    logoUrl: settingLogoUrl.value.trim(),
    faviconUrl: settingFaviconUrl.value.trim(),
    backgroundImage: settingBackgroundImage.value.trim(),
    showWelcome: settingShowWelcome.checked,
    showSuggestions: settingShowSuggestions.checked,
    showDeveloper: settingShowDeveloper.checked,
    enableImageTools: settingEnableImageTools.checked
  };

  saveSettingsButton.disabled = true;

  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.ownerToken}`
      },
      body: JSON.stringify(settings)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    applySettings(data.settings || settings);

    showSettingsMessage("تم حفظ التغييرات بنجاح.", false);
  } catch (error) {
    showSettingsMessage(
      error.message || "تعذر حفظ الإعدادات.",
      true
    );
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function showSettingsMessage(message, isError) {
  settingsMessage.textContent = message;
  settingsMessage.classList.toggle("error", Boolean(isError));
}

async function uploadBrandImage(file, type) {
  if (!file || !state.ownerToken) return;

  if (!file.type.startsWith("image/")) {
    showSettingsMessage("اختر ملف صورة فقط.", true);
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showSettingsMessage("حجم الصورة يجب ألا يتجاوز 5MB.", true);
    return;
  }

  try {
    showSettingsMessage("جاري رفع الصورة...", false);

    const dataUrl = await readImageFile(file);

    const response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.ownerToken}`
      },
      body: JSON.stringify({
        dataUrl,
        type
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    if (type === "logo") {
      settingLogoUrl.value = data.url;
      settingFaviconUrl.value = data.url;
    } else {
      settingBackgroundImage.value = data.url;
    }

    showSettingsMessage("تم رفع الصورة. اضغط حفظ التغييرات.", false);
  } catch (error) {
    showSettingsMessage(
      error.message || "تعذر رفع الصورة.",
      true
    );
  } finally {
    if (logoFileInput) logoFileInput.value = "";
    if (backgroundFileInput) backgroundFileInput.value = "";
  }
}

function toggleTheme() {
  document.body.classList.toggle("light");

  localStorage.setItem(
    "tmd_theme",
    document.body.classList.contains("light")
      ? "light"
      : "dark"
  );
}

function loadTheme() {
  if (localStorage.getItem("tmd_theme") === "light") {
    document.body.classList.add("light");
  }
}

function resizeInput() {
  if (!input) return;

  input.style.height = "auto";
  input.style.height =
    Math.min(input.scrollHeight, 170) + "px";
}

function showError(message) {
  addMessage("assistant", message, true);
}

function newChat() {
  state.messages = [];
  saveMessages();
  render();
  input.focus();
}

function closeSidebar() {
  sidebar?.classList.remove("open");
  overlay?.classList.remove("show");
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeCssUrl(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\)/g, "\\)");
}

composer?.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input?.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

input?.addEventListener("input", resizeInput);

plusButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePlusMenu();
});

imageUploadButton?.addEventListener("click", () => {
  openImagePicker("analyze");
});

imageEditButton?.addEventListener("click", () => {
  openImagePicker("edit");
});

imageInput?.addEventListener("change", handleImageSelection);

removeImage?.addEventListener("click", removeSelectedImage);

document.addEventListener("click", (event) => {
  if (
    plusMenu &&
    plusButton &&
    !plusMenu.contains(event.target) &&
    !plusButton.contains(event.target)
  ) {
    plusMenu.classList.remove("show");
    plusMenu.setAttribute("aria-hidden", "true");
    plusButton.setAttribute("aria-expanded", "false");
  }
});

$("newChat")?.addEventListener("click", () => {
  newChat();
  closeSidebar();
});

$("clearChat")?.addEventListener("click", newChat);

$("theme")?.addEventListener("click", toggleTheme);
$("topTheme")?.addEventListener("click", toggleTheme);

$("menuBtn")?.addEventListener("click", () => {
  sidebar?.classList.add("open");
  overlay?.classList.add("show");
});

overlay?.addEventListener("click", closeSidebar);

ownerButton?.addEventListener("click", openOwnerPanel);
closeOwnerModal?.addEventListener("click", closeOwnerPanel);
ownerLoginForm?.addEventListener("submit", loginOwner);
saveSettingsButton?.addEventListener("click", saveOwnerSettings);

ownerLogout?.addEventListener("click", () => {
  state.ownerToken = "";
  sessionStorage.removeItem("tmd_owner_token");
  showOwnerLogin();
  closeOwnerPanel();
});

ownerModal?.addEventListener("click", (event) => {
  if (event.target === ownerModal) {
    closeOwnerPanel();
  }
});

logoFileInput?.addEventListener("change", (event) => {
  uploadBrandImage(event.target.files?.[0], "logo");
});

backgroundFileInput?.addEventListener("change", (event) => {
  uploadBrandImage(event.target.files?.[0], "background");
});

loadTheme();
loadSettings();
render();
