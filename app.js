"use strict";

/*
 * T.M.D AI
 * التطبيق الرئيسي
 * المطور: ياسين عمرو عبد الرحيم
 */

/* =====================================================
   الحالة
===================================================== */

const DEFAULT_SETTINGS = {
  siteName: "T.M.D AI",
  siteDescription: "المساعد الذكي",

  developerName: "ياسين عمرو عبد الرحيم",

  primaryColor: "#c9a227",
  secondaryColor: "#ffffff",

  textColor: "#222222",
  backgroundColor: "#faf8f1",
  panelColor: "#ffffff",
  borderColor: "#d8c58a",
  sidebarIconColor: "#c9a227",

  logoText: "T",
  logoUrl: "",
  faviconUrl: "",
  backgroundImage: "",

  showWelcome: true,
  showSuggestions: true,
  showDeveloper: true,
  enableImageTools: true,

  suggestions: [
    {
      title: "شرح الذكاء الاصطناعي",
      icon: "🤖",
      prompt: "اشرح لي الذكاء الاصطناعي بطريقة بسيطة"
    },
    {
      title: "اكتب كود",
      icon: "💻",
      prompt: "اكتب لي كود HTML احترافي"
    },
    {
      title: "حل مسألة",
      icon: "🧮",
      prompt: "حل لي هذه المسألة خطوة بخطوة"
    },
    {
      title: "سؤال ديني",
      icon: "📖",
      prompt:
        "أجب عن هذا السؤال الديني مع ذكر المصادر الموثوقة وبيان اختلاف العلماء إن وجد."
    }
  ]
};


const state = {
  messages: loadMessages(),
  busy: false,

  selectedImage: null,
  imageMode: "analyze",

  ownerToken:
    sessionStorage.getItem("tmd_owner_token") || "",

  settings: {
    ...DEFAULT_SETTINGS
  }
};


/* =====================================================
   العناصر
===================================================== */

const chat =
  document.getElementById("chat");

const input =
  document.getElementById("input");

const composer =
  document.getElementById("composer");

const send =
  document.getElementById("send");

const welcome =
  document.getElementById("welcome");

const sidebar =
  document.getElementById("sidebar");

const overlay =
  document.getElementById("overlay");

const plusButton =
  document.getElementById("plusButton");

const plusMenu =
  document.getElementById("plusMenu");

const imageInput =
  document.getElementById("imageInput");

const imageUploadButton =
  document.getElementById("imageUploadButton");

const imageEditButton =
  document.getElementById("imageEditButton");

const imagePreview =
  document.getElementById("imagePreview");

const previewImage =
  document.getElementById("previewImage");

const removeImage =
  document.getElementById("removeImage");


/* =====================================================
   عناصر المالك
===================================================== */

const ownerButton =
  document.getElementById("ownerButton");

const ownerModal =
  document.getElementById("ownerModal");

const closeOwnerModal =
  document.getElementById("closeOwnerModal");

const ownerLoginSection =
  document.getElementById("ownerLoginSection");

const ownerPanelSection =
  document.getElementById("ownerPanelSection");

const ownerLoginForm =
  document.getElementById("ownerLoginForm");

const ownerPassword =
  document.getElementById("ownerPassword");

const ownerLoginError =
  document.getElementById("ownerLoginError");

const ownerLogout =
  document.getElementById("ownerLogout");

const saveSettingsButton =
  document.getElementById("saveSettings");

const settingsMessage =
  document.getElementById("settingsMessage");


/* =====================================================
   حقول الإعدادات
===================================================== */

const settingSiteName =
  document.getElementById("settingSiteName");

const settingDescription =
  document.getElementById("settingDescription");

const settingDeveloper =
  document.getElementById("settingDeveloper");

const settingLogoText =
  document.getElementById("settingLogoText");

const settingPrimaryColor =
  document.getElementById("settingPrimaryColor");

const settingTextColor =
  document.getElementById("settingTextColor");

const settingBackgroundColor =
  document.getElementById("settingBackgroundColor");

const settingPanelColor =
  document.getElementById("settingPanelColor");

const settingBorderColor =
  document.getElementById("settingBorderColor");

const settingSidebarIconColor =
  document.getElementById(
    "settingSidebarIconColor"
  );

const settingLogoUrl =
  document.getElementById("settingLogoUrl");

const settingFaviconUrl =
  document.getElementById(
    "settingFaviconUrl"
  );

const settingBackgroundImage =
  document.getElementById(
    "settingBackgroundImage"
  );


const logoFileInput =
  document.getElementById("logoFileInput");

const backgroundFileInput =
  document.getElementById(
    "backgroundFileInput"
  );


const settingShowWelcome =
  document.getElementById(
    "settingShowWelcome"
  );

const settingShowSuggestions =
  document.getElementById(
    "settingShowSuggestions"
  );

const settingShowDeveloper =
  document.getElementById(
    "settingShowDeveloper"
  );

const settingEnableImageTools =
  document.getElementById(
    "settingEnableImageTools"
  );


/* =====================================================
   أزرار عامة
===================================================== */

const newChatButton =
  document.getElementById("newChat");

const clearChat =
  document.getElementById("clearChat");

const themeButton =
  document.getElementById("theme");

const topTheme =
  document.getElementById("topTheme");

const menuButton =
  document.getElementById("menuBtn");


/* =====================================================
   تحميل الرسائل
===================================================== */

function loadMessages() {

  try {

    const raw =
      localStorage.getItem(
        "tmd_messages"
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {

    console.error(
      "Load messages error:",
      error
    );

    return [];
  }
}


/* =====================================================
   حفظ الرسائل
===================================================== */

function saveMessages() {

  try {

    localStorage.setItem(
      "tmd_messages",
      JSON.stringify(
        state.messages
      )
    );

  } catch (error) {

    console.error(
      "Save messages error:",
      error
    );
  }
}


/* =====================================================
   Escape HTML
===================================================== */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =====================================================
   Escape CSS URL
===================================================== */

function escapeCssUrl(value) {

  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\)/g, "\\)");
}


/* =====================================================
   Set Text
===================================================== */

function setText(id, value) {

  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      value ?? "";
  }
}


/* =====================================================
   التمرير لأسفل
===================================================== */

function scrollBottom() {

  requestAnimationFrame(() => {

    if (chat) {
      chat.scrollTop =
        chat.scrollHeight;
    }

  });
}


/* =====================================================
   إضافة رسالة
===================================================== */

function addMessage(
  role,
  text,
  isError = false
) {

  if (!chat) {
    return null;
  }

  const row =
    document.createElement("div");

  row.className =
    `message-row ${role}${
      isError ? " error" : ""
    }`;


  const avatar =
    document.createElement("div");

  avatar.className =
    "avatar";


  avatar.textContent =
    role === "user"
      ? "أنت"
      : (
          state.settings.logoText ||
          "T"
        );


  const bubble =
    document.createElement("div");

  bubble.className =
    "bubble";


  bubble.textContent =
    text;


  if (role === "user") {

    row.append(
      bubble,
      avatar
    );

  } else {

    row.append(
      avatar,
      bubble
    );
  }


  chat.appendChild(row);

  scrollBottom();

  return row;
}


/* =====================================================
   عرض الرسائل
===================================================== */

function render() {

  if (!chat) {
    return;
  }


  chat
    .querySelectorAll(
      ".message-row"
    )
    .forEach(
      element =>
        element.remove()
    );


  if (welcome) {

    welcome.style.display =
      state.messages.length
        ? "none"
        : (
            state.settings.showWelcome
              ? "flex"
              : "none"
          );
  }


  state.messages.forEach(
    message => {

      addMessage(
        message.role,
        message.content
      );

    }
  );


  renderSuggestions();
}


/* =====================================================
   الاقتراحات
===================================================== */

function renderSuggestions() {

  const container =
    document.getElementById(
      "suggestions"
    );

  const welcomeCards =
    document.getElementById(
      "welcomeCards"
    );


  const suggestions =
    Array.isArray(
      state.settings.suggestions
    )
      ? state.settings.suggestions
      : DEFAULT_SETTINGS.suggestions;


  const createButton =
    item => {

      const button =
        document.createElement("button");

      button.type =
        "button";

      button.className =
        "suggestion";

      button.dataset.prompt =
        item.prompt || "";

      button.innerHTML =
        `
          <span class="suggestion-icon">
            ${escapeHtml(
              item.icon || "✨"
            )}
          </span>

          <span>
            ${escapeHtml(
              item.title || "اقتراح"
            )}
          </span>
        `;

      button.addEventListener(
        "click",
        () => {

          if (!input) {
            return;
          }

          input.value =
            item.prompt || "";

          resizeInput();

          input.focus();
        }
      );

      return button;
    };


  if (container) {

    container.innerHTML =
      "";

    suggestions.forEach(
      item => {

        container.appendChild(
          createButton(item)
        );

      }
    );
  }


  if (welcomeCards) {

    welcomeCards.innerHTML =
      "";

    suggestions.forEach(
      item => {

        welcomeCards.appendChild(
          createButton(item)
        );

      }
    );
  }


  const display =
    state.settings.showSuggestions
      ? ""
      : "none";


  if (container) {
    container.style.display =
      display;
  }


  if (welcomeCards) {
    welcomeCards.style.display =
      display;
  }
}


/* =====================================================
   حالة الانتظار
===================================================== */

function setBusy(value) {

  state.busy =
    Boolean(value);


  if (send) {

    send.disabled =
      state.busy;

    send.textContent =
      state.busy
        ? "…"
        : "➤";
  }


  if (plusButton) {

    plusButton.disabled =
      state.busy;
  }
}


/* =====================================================
   إرسال رسالة
===================================================== */

async function sendMessage(text) {

  const message =
    String(text || "").trim();


  if (
    !message ||
    state.busy
  ) {
    return;
  }


  state.messages.push({
    role: "user",
    content: message
  });


  saveMessages();

  render();


  if (input) {

    input.value =
      "";

    input.style.height =
      "auto";
  }


  setBusy(true);


  const typing =
    document.createElement("div");

  typing.className =
    "message-row assistant";


  typing.innerHTML =
    `
      <div class="avatar">
        ${escapeHtml(
          state.settings.logoText || "T"
        )}
      </div>

      <div class="bubble typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;


  chat.appendChild(
    typing
  );

  scrollBottom();


  try {

    const response =
      await fetch(
        "/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              messages:
                state.messages
            })
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    typing.remove();


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );
    }


    state.messages.push({
      role: "assistant",
      content:
        data.message ||
        "لم تصل إجابة من الخادم."
    });


    saveMessages();

    render();


  } catch (error) {

    typing.remove();

    showError(
      `حدث خطأ: ${
        error.message ||
        "تعذر الاتصال بالخادم."
      }`
    );

  } finally {

    setBusy(false);

    input?.focus();
  }
}


/* =====================================================
   رسالة خطأ
===================================================== */

function showError(message) {

  addMessage(
    "assistant",
    message,
    true
  );
}


/* =====================================================
   زر +
===================================================== */

function togglePlusMenu() {

  if (!plusMenu) {
    return;
  }


  const opened =
    plusMenu.classList.contains(
      "show"
    );


  if (opened) {

    plusMenu.classList.remove(
      "show"
    );

    plusMenu.setAttribute(
      "aria-hidden",
      "true"
    );

    plusButton?.setAttribute(
      "aria-expanded",
      "false"
    );

  } else {

    plusMenu.classList.add(
      "show"
    );

    plusMenu.setAttribute(
      "aria-hidden",
      "false"
    );

    plusButton?.setAttribute(
      "aria-expanded",
      "true"
    );
  }
}


/* =====================================================
   اختيار الصورة
===================================================== */

function openImagePicker(
  mode = "analyze"
) {

  state.imageMode =
    mode;


  if (plusMenu) {

    plusMenu.classList.remove(
      "show"
    );

    plusMenu.setAttribute(
      "aria-hidden",
      "true"
    );
  }


  if (plusButton) {

    plusButton.setAttribute(
      "aria-expanded",
      "false"
    );
  }


  if (imageInput) {

    imageInput.value =
      "";

    imageInput.click();
  }
}


/* =====================================================
   قراءة ملف
===================================================== */

function readFileAsDataURL(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload =
        () => resolve(
          reader.result
        );


      reader.onerror =
        () =>
          reject(
            new Error(
              "تعذر قراءة الملف."
            )
          );


      reader.readAsDataURL(
        file
      );
    }
  );
}


/* =====================================================
   اختيار صورة
===================================================== */

async function handleImageSelection(event) {

  const file =
    event.target.files?.[0];


  if (!file) {
    return;
  }


  if (
    !file.type.startsWith(
      "image/"
    )
  ) {

    showError(
      "الملف المحدد ليس صورة."
    );

    return;
  }


  if (
    file.size >
    8 * 1024 * 1024
  ) {

    showError(
      "حجم الصورة يجب ألا يتجاوز 8MB."
    );

    return;
  }


  try {

    const dataUrl =
      await readFileAsDataURL(
        file
      );


    state.selectedImage = {
      file,
      dataUrl
    };


    if (previewImage) {

      previewImage.src =
        dataUrl;
    }


    if (imagePreview) {

      imagePreview.hidden =
        false;
    }


    await analyzeSelectedImage();


  } catch (error) {

    console.error(
      "Image error:",
      error
    );

    showError(
      error.message ||
      "تعذر التعامل مع الصورة."
    );
  }
}


/* =====================================================
   تحليل الصورة
===================================================== */

async function analyzeSelectedImage() {

  if (
    !state.selectedImage ||
    state.busy
  ) {
    return;
  }


  const prompt =
    input?.value.trim() ||
    (
      state.imageMode === "edit"
        ? "حلل الصورة واقترح تعديلات احترافية يمكن تنفيذها عليها."
        : "حلل هذه الصورة بالتفصيل واذكر العناصر والمعلومات المهمة الموجودة فيها."
    );


  if (input) {

    input.value =
      "";

    input.style.height =
      "auto";
  }


  setBusy(true);


  const userRow =
    document.createElement("div");

  userRow.className =
    "message-row user";


  const userAvatar =
    document.createElement("div");

  userAvatar.className =
    "avatar";

  userAvatar.textContent =
    "أنت";


  const userBubble =
    document.createElement("div");

  userBubble.className =
    "bubble image-message";


  const image =
    document.createElement("img");

  image.src =
    state.selectedImage.dataUrl;

  image.alt =
    "الصورة المرسلة";


  const caption =
    document.createElement("div");

  caption.textContent =
    prompt;


  userBubble.append(
    image,
    caption
  );


  userRow.append(
    userBubble,
    userAvatar
  );


  chat.appendChild(
    userRow
  );


  const typing =
    document.createElement("div");

  typing.className =
    "message-row assistant";


  typing.innerHTML =
    `
      <div class="avatar">
        ${escapeHtml(
          state.settings.logoText || "T"
        )}
      </div>

      <div class="bubble typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;


  chat.appendChild(
    typing
  );


  scrollBottom();


  try {

    const response =
      await fetch(
        "/api/image",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              image:
                state.selectedImage.dataUrl,

              prompt,

              mode:
                state.imageMode
            })
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    typing.remove();


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );
    }


    addMessage(
      "assistant",
      data.message ||
      "تم تحليل الصورة."
    );


  } catch (error) {

    typing.remove();

    showError(
      `تعذر التعامل مع الصورة: ${
        error.message ||
        "خطأ غير معروف."
      }`
    );

  } finally {

    setBusy(false);

    removeSelectedImage();

    input?.focus();
  }
}


/* =====================================================
   إزالة الصورة
===================================================== */

function removeSelectedImage() {

  state.selectedImage =
    null;


  if (imagePreview) {

    imagePreview.hidden =
      true;
  }


  if (previewImage) {

    previewImage.src =
      "";
  }


  if (imageInput) {

    imageInput.value =
      "";
  }
}


/* =====================================================
   تطبيق إعدادات الموقع
===================================================== */

function applySettings(incoming) {

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(incoming || {})
  };


  const s =
    state.settings;


  const root =
    document.documentElement;


  root.style.setProperty(
    "--primary-color",
    s.primaryColor
  );


  root.style.setProperty(
    "--secondary-color",
    s.secondaryColor
  );


  root.style.setProperty(
    "--text-color",
    s.textColor
  );


  root.style.setProperty(
    "--background-color",
    s.backgroundColor
  );


  root.style.setProperty(
    "--panel-color",
    s.panelColor
  );


  root.style.setProperty(
    "--border-color",
    s.borderColor
  );


  root.style.setProperty(
    "--sidebar-icon-color",
    s.sidebarIconColor
  );


  /* الخلفية */

  if (s.backgroundImage) {

    document.body.style.backgroundImage =
      `url("${escapeCssUrl(
        s.backgroundImage
      )}")`;

    document.body.classList.add(
      "custom-background"
    );

  } else {

    document.body.style.backgroundImage =
      "";

    document.body.classList.remove(
      "custom-background"
    );
  }


  /* النصوص */

  setText(
    "siteName",
    s.siteName
  );

  setText(
    "topSiteName",
    s.siteName
  );

  setText(
    "welcomeSiteName",
    s.siteName
  );

  setText(
    "siteDescription",
    s.siteDescription
  );

  setText(
    "welcomeDescription",
    s.siteDescription
  );


  setText(
    "developer",
    `المطور: ${s.developerName}`
  );


  /* الشعار */

  const brandIcon =
    document.getElementById(
      "brandIcon"
    );

  const welcomeLogo =
    document.getElementById(
      "welcomeLogo"
    );


  if (s.logoUrl) {

    if (brandIcon) {

      brandIcon.innerHTML =
        `<img src="${escapeHtml(
          s.logoUrl
        )}" alt="Logo">`;
    }


    if (welcomeLogo) {

      welcomeLogo.innerHTML =
        `<img src="${escapeHtml(
          s.logoUrl
        )}" alt="Logo">`;
    }

  } else {

    if (brandIcon) {

      brandIcon.textContent =
        s.logoText || "T";
    }


    if (welcomeLogo) {

      welcomeLogo.textContent =
        s.logoText || "T";
    }
  }


  /* Favicon */

  const favicon =
    document.getElementById(
      "favicon"
    );


  if (
    favicon &&
    s.faviconUrl
  ) {

    favicon.href =
      s.faviconUrl;
  }


  /* عنوان الصفحة */

  document.title =
    s.siteName ||
    "T.M.D AI";


  /* المطور */

  const developer =
    document.getElementById(
      "developer"
    );


  if (developer) {

    developer.style.display =
      s.showDeveloper
        ? ""
        : "none";
  }


  /* الترحيب */

  if (welcome) {

    welcome.style.display =
      (
        s.showWelcome &&
        state.messages.length === 0
      )
        ? "flex"
        : "none";
  }


  /* أدوات الصور */

  if (plusButton) {

    plusButton.style.display =
      s.enableImageTools
        ? "inline-flex"
        : "none";
  }


  if (plusMenu) {

    if (!s.enableImageTools) {

      plusMenu.classList.remove(
        "show"
      );
    }
  }


  renderSuggestions();
}


/* =====================================================
   جلب الإعدادات العامة
===================================================== */

async function loadSettings() {

  try {

    const response =
      await fetch(
        "/api/settings",
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      response.ok &&
      data.ok
    ) {

      applySettings(
        data.settings || {}
      );

      return;
    }


  } catch (error) {

    console.warn(
      "Settings error:",
      error
    );
  }


  applySettings(
    DEFAULT_SETTINGS
  );
}


/* =====================================================
   فتح لوحة المالك
===================================================== */

async function openOwnerPanel() {

  if (!ownerModal) {
    return;
  }


  ownerModal.hidden =
    false;


  if (state.ownerToken) {

    showOwnerPanel();

    await loadOwnerSettings();

  } else {

    showOwnerLogin();
  }
}


/* =====================================================
   إغلاق لوحة المالك
===================================================== */

function closeOwnerPanel() {

  if (ownerModal) {

    ownerModal.hidden =
      true;
  }
}


/* =====================================================
   إظهار تسجيل دخول المالك
===================================================== */

function showOwnerLogin() {

  if (ownerLoginSection) {

    ownerLoginSection.hidden =
      false;
  }


  if (ownerPanelSection) {

    ownerPanelSection.hidden =
      true;
  }
}


/* =====================================================
   إظهار لوحة التحكم
===================================================== */

function showOwnerPanel() {

  if (ownerLoginSection) {

    ownerLoginSection.hidden =
      true;
  }


  if (ownerPanelSection) {

    ownerPanelSection.hidden =
      false;
  }
}


/* =====================================================
   تسجيل دخول المالك
===================================================== */

async function loginOwner(event) {

  event.preventDefault();


  const password =
    ownerPassword?.value.trim();


  if (!password) {

    setOwnerError(
      "أدخل كلمة مرور المالك."
    );

    return;
  }


  setOwnerError("");


  try {

    const response =
      await fetch(
        "/api/owner-login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              password
            })
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok ||
      !data.ok ||
      !data.token
    ) {

      throw new Error(
        data.error ||
        "بيانات الدخول غير صحيحة."
      );
    }


    state.ownerToken =
      data.token;


    sessionStorage.setItem(
      "tmd_owner_token",
      state.ownerToken
    );


    if (ownerPassword) {

      ownerPassword.value =
        "";
    }


    showOwnerPanel();

    await loadOwnerSettings();


  } catch (error) {

    setOwnerError(
      error.message ||
      "تعذر تسجيل الدخول."
    );
  }
}


/* =====================================================
   خطأ المالك
===================================================== */

function setOwnerError(message) {

  if (ownerLoginError) {

    ownerLoginError.textContent =
      message || "";
  }
}


/* =====================================================
   جلب إعدادات المالك
===================================================== */

async function loadOwnerSettings() {

  if (!state.ownerToken) {
    return;
  }


  try {

    const response =
      await fetch(
        "/api/settings",
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        "تعذر جلب الإعدادات."
      );
    }


    const settings = {
      ...DEFAULT_SETTINGS,
      ...(data.settings || {})
    };


    fillSettingsForm(
      settings
    );


  } catch (error) {

    console.error(
      "Owner settings error:",
      error
    );


    showSettingsMessage(
      error.message,
      true
    );
  }
}


/* =====================================================
   تعبئة إعدادات المالك
===================================================== */

function fillSettingsForm(settings) {

  if (settingSiteName) {

    settingSiteName.value =
      settings.siteName || "";
  }


  if (settingDescription) {

    settingDescription.value =
      settings.siteDescription || "";
  }


  if (settingDeveloper) {

    settingDeveloper.value =
      settings.developerName || "";
  }


  if (settingLogoText) {

    settingLogoText.value =
      settings.logoText || "T";
  }


  if (settingPrimaryColor) {

    settingPrimaryColor.value =
      settings.primaryColor ||
      DEFAULT_SETTINGS.primaryColor;
  }


  if (settingTextColor) {

    settingTextColor.value =
      settings.textColor ||
      DEFAULT_SETTINGS.textColor;
  }


  if (settingBackgroundColor) {

    settingBackgroundColor.value =
      settings.backgroundColor ||
      DEFAULT_SETTINGS.backgroundColor;
  }


  if (settingPanelColor) {

    settingPanelColor.value =
      settings.panelColor ||
      DEFAULT_SETTINGS.panelColor;
  }


  if (settingBorderColor) {

    settingBorderColor.value =
      settings.borderColor ||
      DEFAULT_SETTINGS.borderColor;
  }


  if (settingSidebarIconColor) {

    settingSidebarIconColor.value =
      settings.sidebarIconColor ||
      DEFAULT_SETTINGS.sidebarIconColor;
  }


  if (settingLogoUrl) {

    settingLogoUrl.value =
      settings.logoUrl || "";
  }


  if (settingFaviconUrl) {

    settingFaviconUrl.value =
      settings.faviconUrl || "";
  }


  if (settingBackgroundImage) {

    settingBackgroundImage.value =
      settings.backgroundImage || "";
  }


  if (settingShowWelcome) {

    settingShowWelcome.checked =
      settings.showWelcome !== false;
  }


  if (settingShowSuggestions) {

    settingShowSuggestions.checked =
      settings.showSuggestions !== false;
  }


  if (settingShowDeveloper) {

    settingShowDeveloper.checked =
      settings.showDeveloper !== false;
  }


  if (settingEnableImageTools) {

    settingEnableImageTools.checked =
      settings.enableImageTools !== false;
  }
}


/* =====================================================
   تحويل صورة إلى Data URL
===================================================== */

async function convertUploadToDataUrl(
  file
) {

  if (!file) {
    return "";
  }


  if (
    !file.type.startsWith(
      "image/"
    )
  ) {

    throw new Error(
      "الملف يجب أن يكون صورة."
    );
  }


  if (
    file.size >
    5 * 1024 * 1024
  ) {

    throw new Error(
      "حجم الصورة يجب ألا يتجاوز 5MB."
    );
  }


  return await readFileAsDataURL(
    file
  );
}


/* =====================================================
   رفع الشعار
===================================================== */

if (logoFileInput) {

  logoFileInput.addEventListener(
    "change",
    async event => {

      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      try {

        const dataUrl =
          await convertUploadToDataUrl(
            file
          );


        if (settingLogoUrl) {

          settingLogoUrl.value =
            dataUrl;
        }


        showSettingsMessage(
          "تم تجهيز الشعار للحفظ.",
          false
        );


      } catch (error) {

        showSettingsMessage(
          error.message,
          true
        );
      }
    }
  );
}


/* =====================================================
   رفع الخلفية
===================================================== */

if (backgroundFileInput) {

  backgroundFileInput.addEventListener(
    "change",
    async event => {

      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      try {

        const dataUrl =
          await convertUploadToDataUrl(
            file
          );


        if (settingBackgroundImage) {

          settingBackgroundImage.value =
            dataUrl;
        }


        showSettingsMessage(
          "تم تجهيز الخلفية للحفظ.",
          false
        );


      } catch (error) {

        showSettingsMessage(
          error.message,
          true
        );
      }
    }
  );
}


/* =====================================================
   حفظ الإعدادات
===================================================== */

async function saveOwnerSettings() {

  if (!state.ownerToken) {

    showSettingsMessage(
      "يجب تسجيل دخول المالك أولًا.",
      true
    );

    return;
  }


  const settings = {

    siteName:
      settingSiteName?.value.trim() ||
      DEFAULT_SETTINGS.siteName,

    siteDescription:
      settingDescription?.value.trim() ||
      DEFAULT_SETTINGS.siteDescription,

    developerName:
      settingDeveloper?.value.trim() ||
      DEFAULT_SETTINGS.developerName,

    primaryColor:
      settingPrimaryColor?.value ||
      DEFAULT_SETTINGS.primaryColor,

    secondaryColor:
      DEFAULT_SETTINGS.secondaryColor,

    textColor:
      settingTextColor?.value ||
      DEFAULT_SETTINGS.textColor,

    backgroundColor:
      settingBackgroundColor?.value ||
      DEFAULT_SETTINGS.backgroundColor,

    panelColor:
      settingPanelColor?.value ||
      DEFAULT_SETTINGS.panelColor,

    borderColor:
      settingBorderColor?.value ||
      DEFAULT_SETTINGS.borderColor,

    sidebarIconColor:
      settingSidebarIconColor?.value ||
      DEFAULT_SETTINGS.sidebarIconColor,

    logoText:
      settingLogoText?.value.trim() ||
      DEFAULT_SETTINGS.logoText,

    logoUrl:
      settingLogoUrl?.value.trim() ||
      "",

    faviconUrl:
      settingFaviconUrl?.value.trim() ||
      "",

    backgroundImage:
      settingBackgroundImage?.value.trim() ||
      "",

    showWelcome:
      settingShowWelcome?.checked !== false,

    showSuggestions:
      settingShowSuggestions?.checked !== false,

    showDeveloper:
      settingShowDeveloper?.checked !== false,

    enableImageTools:
      settingEnableImageTools?.checked !== false,

    suggestions:
      state.settings.suggestions
  };


  if (saveSettingsButton) {

    saveSettingsButton.disabled =
      true;

    saveSettingsButton.textContent =
      "جارٍ الحفظ...";
  }


  try {

    const response =
      await fetch(
        "/api/settings",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${state.ownerToken}`
          },

          body:
            JSON.stringify(settings)
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      response.status === 401
    ) {

      state.ownerToken =
        "";

      sessionStorage.removeItem(
        "tmd_owner_token"
      );

      showOwnerLogin();

      throw new Error(
        "انتهت جلسة المالك. سجل الدخول مرة أخرى."
      );
    }


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );
    }


    applySettings(
      data.settings ||
      settings
    );


    showSettingsMessage(
      "تم حفظ الإعدادات بنجاح.",
      false
    );


  } catch (error) {

    console.error(
      "Save settings error:",
      error
    );


    showSettingsMessage(
      error.message ||
      "تعذر حفظ الإعدادات.",
      true
    );


  } finally {

    if (saveSettingsButton) {

      saveSettingsButton.disabled =
        false;

      saveSettingsButton.textContent =
        "حفظ التغييرات";
    }
  }
}


/* =====================================================
   رسالة الإعدادات
===================================================== */

function showSettingsMessage(
  message,
  isError = false
) {

  if (!settingsMessage) {
    return;
  }


  settingsMessage.textContent =
    message || "";


  settingsMessage.classList.toggle(
    "error",
    Boolean(isError)
  );


  clearTimeout(
    showSettingsMessage.timer
  );


  showSettingsMessage.timer =
    setTimeout(
      () => {

        if (settingsMessage) {

          settingsMessage.textContent =
            "";
        }

      },
      5000
    );
}


/* =====================================================
   تسجيل خروج المالك
===================================================== */

async function logoutOwner() {

  const token =
    state.ownerToken;


  try {

    if (token) {

      await fetch(
        "/api/owner-logout",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      ).catch(
        () => {}
      );
    }

  } finally {

    state.ownerToken =
      "";

    sessionStorage.removeItem(
      "tmd_owner_token"
    );

    showOwnerLogin();

    closeOwnerPanel();
  }
}


/* =====================================================
   الوضع الليلي / الفاتح
===================================================== */

function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );


  const theme =
    document.body.classList.contains(
      "light"
    )
      ? "light"
      : "dark";


  localStorage.setItem(
    "tmd_theme",
    theme
  );
}


/* =====================================================
   تحميل المظهر
===================================================== */

function loadTheme() {

  const theme =
    localStorage.getItem(
      "tmd_theme"
    );


  if (theme === "light") {

    document.body.classList.add(
      "light"
    );

  } else {

    document.body.classList.remove(
      "light"
    );
  }
}


/* =====================================================
   تغيير حجم مربع الكتابة
===================================================== */

function resizeInput() {

  if (!input) {
    return;
  }


  input.style.height =
    "auto";


  input.style.height =
    Math.min(
      input.scrollHeight,
      170
    ) + "px";
}


/* =====================================================
   محادثة جديدة
===================================================== */

function newChat() {

  state.messages =
    [];

  saveMessages();

  render();

  input?.focus();
}


/* =====================================================
   القائمة الجانبية
===================================================== */

function closeSidebar() {

  sidebar?.classList.remove(
    "open"
  );

  overlay?.classList.remove(
    "show"
  );
}


/* =====================================================
   الأحداث
===================================================== */


/* إرسال */

if (composer) {

  composer.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      sendMessage(
        input?.value || ""
      );
    }
  );
}


/* Enter */

if (input) {

  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        composer?.requestSubmit();
      }
    }
  );


  input.addEventListener(
    "input",
    resizeInput
  );
}


/* زر + */

if (plusButton) {

  plusButton.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      togglePlusMenu();
    }
  );
}


/* تحليل صورة */

if (imageUploadButton) {

  imageUploadButton.addEventListener(
    "click",
    () => {

      openImagePicker(
        "analyze"
      );
    }
  );
}


/* تعديل صورة */

if (imageEditButton) {

  imageEditButton.addEventListener(
    "click",
    () => {

      openImagePicker(
        "edit"
      );
    }
  );
}


/* اختيار الصورة */

if (imageInput) {

  imageInput.addEventListener(
    "change",
    handleImageSelection
  );
}


/* إزالة الصورة */

if (removeImage) {

  removeImage.addEventListener(
    "click",
    removeSelectedImage
  );
}


/* الضغط خارج قائمة + */

document.addEventListener(
  "click",
  event => {

    if (
      plusMenu &&
      plusButton &&
      !plusMenu.contains(
        event.target
      ) &&
      !plusButton.contains(
        event.target
      )
    ) {

      plusMenu.classList.remove(
        "show"
      );

      plusMenu.setAttribute(
        "aria-hidden",
        "true"
      );

      plusButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  }
);


/* محادثة جديدة */

if (newChatButton) {

  newChatButton.addEventListener(
    "click",
    () => {

      newChat();

      closeSidebar();
    }
  );
}


/* مسح المحادثة */

if (clearChat) {

  clearChat.addEventListener(
    "click",
    newChat
  );
}


/* تغيير المظهر */

if (themeButton) {

  themeButton.addEventListener(
    "click",
    toggleTheme
  );
}


/* زر المظهر العلوي */

if (topTheme) {

  topTheme.addEventListener(
    "click",
    toggleTheme
  );
}


/* قائمة الهاتف */

if (menuButton) {

  menuButton.addEventListener(
    "click",
    () => {

      sidebar?.classList.add(
        "open"
      );

      overlay?.classList.add(
        "show"
      );
    }
  );
}


/* إغلاق القائمة */

if (overlay) {

  overlay.addEventListener(
    "click",
    closeSidebar
  );
}


/* لوحة المالك */

if (ownerButton) {

  ownerButton.addEventListener(
    "click",
    openOwnerPanel
  );
}


/* إغلاق لوحة المالك */

if (closeOwnerModal) {

  closeOwnerModal.addEventListener(
    "click",
    closeOwnerPanel
  );
}


/* تسجيل دخول المالك */

if (ownerLoginForm) {

  ownerLoginForm.addEventListener(
    "submit",
    loginOwner
  );
}


/* حفظ الإعدادات */

if (saveSettingsButton) {

  saveSettingsButton.addEventListener(
    "click",
    saveOwnerSettings
  );
}


/* خروج المالك */

if (ownerLogout) {

  ownerLogout.addEventListener(
    "click",
    logoutOwner
  );
}


/* الضغط على خلفية النافذة */

if (ownerModal) {

  ownerModal.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        ownerModal
      ) {

        closeOwnerPanel();
      }
    }
  );
}


/* =====================================================
   تشغيل
===================================================== */

loadTheme();

loadSettings();

render();
