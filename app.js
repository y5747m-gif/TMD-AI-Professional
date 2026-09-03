"use strict";

/*
 * T.M.D AI
 * الواجهة الرئيسية
 * المطور: ياسين عمرو عبد الرحيم
 */

const state = {
  messages: JSON.parse(
    localStorage.getItem("tmd_messages") || "[]"
  ),
  busy: false,
  selectedImage: null,
  imageMode: "analyze",
  ownerToken: sessionStorage.getItem("tmd_owner_token") || "",
  settings: null
};


/* =========================
   العناصر
========================= */

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const send = document.getElementById("send");
const welcome = document.getElementById("welcome");

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const plusButton = document.getElementById("plusButton");
const plusMenu = document.getElementById("plusMenu");

const imageInput = document.getElementById("imageInput");
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


/* لوحة المالك */

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


/* إعدادات الموقع */

const settingSiteName =
  document.getElementById("settingSiteName");

const settingDescription =
  document.getElementById("settingDescription");

const settingDeveloper =
  document.getElementById("settingDeveloper");

const settingPrimaryColor =
  document.getElementById("settingPrimaryColor");

const settingBackgroundColor =
  document.getElementById("settingBackgroundColor");

const settingLogoText =
  document.getElementById("settingLogoText");

const settingBackgroundImage =
  document.getElementById("settingBackgroundImage");


/* =========================
   الإعدادات الافتراضية
========================= */

const DEFAULT_SETTINGS = {
  siteName: "T.M.D AI",

  siteDescription:
    "المساعد الذكي",

  developerName:
    "ياسين عمرو عبد الرحيم",

  primaryColor:
    "#c9a227",

  secondaryColor:
    "#ffffff",

  backgroundColor:
    "#faf8f1",

  logoText:
    "T",

  backgroundImage:
    "",

  showWelcome:
    true,

  showSuggestions:
    true,

  showDeveloper:
    true,

  enableImageTools:
    true
};


/* =========================
   الحفظ المحلي
========================= */

function saveMessages() {
  try {
    localStorage.setItem(
      "tmd_messages",
      JSON.stringify(state.messages)
    );
  } catch (error) {
    console.error(
      "Save messages error:",
      error
    );
  }
}


/* =========================
   التمرير
========================= */

function scrollBottom() {
  requestAnimationFrame(() => {
    if (chat) {
      chat.scrollTop =
        chat.scrollHeight;
    }
  });
}


/* =========================
   إضافة رسالة
========================= */

function addMessage(
  role,
  text,
  isError = false
) {

  const row =
    document.createElement("div");

  row.className =
    `message-row ${role}${isError ? " error" : ""}`;


  const avatar =
    document.createElement("div");

  avatar.className =
    "avatar";

  avatar.textContent =
    role === "user"
      ? "أنت"
      : (
          state.settings?.logoText ||
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


/* =========================
   عرض المحادثة
========================= */

function render() {

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
        : "flex";

  }


  state.messages.forEach(
    message => {

      addMessage(
        message.role,
        message.content
      );

    }
  );
}


/* =========================
   حالة الانتظار
========================= */

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
}


/* =========================
   القائمة الجانبية
========================= */

function closeSidebar() {

  if (sidebar) {
    sidebar.classList.remove(
      "open"
    );
  }

  if (overlay) {
    overlay.classList.remove(
      "show"
    );
  }
}


/* =========================
   محادثة جديدة
========================= */

function newChat() {

  state.messages = [];

  saveMessages();

  render();

  if (input) {
    input.focus();
  }
}


/* =========================
   رسالة خطأ
========================= */

function showError(message) {

  addMessage(
    "assistant",
    message,
    true
  );
}


/* =========================
   إرسال الرسالة
========================= */

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


  input.value = "";

  input.style.height =
    "auto";


  setBusy(true);


  const typing =
    document.createElement(
      "div"
    );


  typing.className =
    "message-row assistant";


  typing.innerHTML =
    `
      <div class="avatar">
        ${escapeHtml(
          state.settings?.logoText || "T"
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
        data.message
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

    input.focus();

  }
}


/* =========================
   زر +
========================= */

function togglePlusMenu() {

  if (!plusMenu) {
    return;
  }


  const isOpen =
    plusMenu.classList.contains(
      "show"
    );


  if (isOpen) {

    plusMenu.classList.remove(
      "show"
    );

    plusMenu.setAttribute(
      "aria-hidden",
      "true"
    );

  } else {

    plusMenu.classList.add(
      "show"
    );

    plusMenu.setAttribute(
      "aria-hidden",
      "false"
    );

  }
}


/* =========================
   فتح رفع الصور
========================= */

function openImagePicker(
  mode = "analyze"
) {

  state.imageMode =
    mode;


  if (plusMenu) {

    plusMenu.classList.remove(
      "show"
    );

  }


  if (imageInput) {

    imageInput.value =
      "";

    imageInput.click();

  }
}


/* =========================
   قراءة الصورة
========================= */

function readImageFile(file) {

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
              "تعذر قراءة الصورة."
            )
          );


      reader.readAsDataURL(
        file
      );

    }
  );
}


/* =========================
   اختيار الصورة
========================= */

async function handleImageSelection(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) {
    return;
  }


  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];


  if (
    !allowedTypes.includes(
      file.type
    )
  ) {

    alert(
      "نوع الصورة غير مدعوم."
    );

    return;

  }


  if (
    file.size >
    8 * 1024 * 1024
  ) {

    alert(
      "حجم الصورة يجب ألا يتجاوز 8MB."
    );

    return;

  }


  try {

    const dataUrl =
      await readImageFile(
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


    /*
     * بعد اختيار الصورة:
     * نرسلها مباشرة للتحليل.
     */

    await analyzeSelectedImage();

  } catch (error) {

    console.error(
      "Image selection error:",
      error
    );

    showError(
      error.message ||
      "تعذر التعامل مع الصورة."
    );

  }
}


/* =========================
   تحليل الصورة
========================= */

async function analyzeSelectedImage() {

  if (
    !state.selectedImage ||
    state.busy
  ) {
    return;
  }


  const prompt =
    input.value.trim() ||
    (
      state.imageMode === "edit"
        ? "أخبرني بالتفصيل كيف يمكن تعديل هذه الصورة وما التعديلات المقترحة."
        : "حلل هذه الصورة بالتفصيل واذكر أهم العناصر والمعلومات الموجودة فيها."
    );


  input.value = "";

  input.style.height =
    "auto";


  setBusy(true);


  const userRow =
    document.createElement(
      "div"
    );


  userRow.className =
    "message-row user";


  const userAvatar =
    document.createElement(
      "div"
    );


  userAvatar.className =
    "avatar";


  userAvatar.textContent =
    "أنت";


  const userBubble =
    document.createElement(
      "div"
    );


  userBubble.className =
    "bubble image-message";


  const image =
    document.createElement(
      "img"
    );


  image.src =
    state.selectedImage.dataUrl;

  image.alt =
    "الصورة المرسلة";


  const caption =
    document.createElement(
      "div"
    );


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


  scrollBottom();


  const typing =
    document.createElement(
      "div"
    );


  typing.className =
    "message-row assistant";


  typing.innerHTML =
    `
      <div class="avatar">
        ${escapeHtml(
          state.settings?.logoText || "T"
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
      data.message
    );


  } catch (error) {

    typing.remove();

    showError(
      `تعذر تحليل الصورة: ${
        error.message ||
        "خطأ غير معروف."
      }`
    );

  } finally {

    setBusy(false);

    removeSelectedImage();

    input.focus();

  }
}


/* =========================
   إزالة الصورة
========================= */

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


/* =========================
   تطبيق إعدادات الموقع
========================= */

function applySettings(
  incoming
) {

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(incoming || {})
  };


  const s =
    state.settings;


  document.documentElement.style.setProperty(
    "--primary-color",
    s.primaryColor
  );


  document.documentElement.style.setProperty(
    "--background-color",
    s.backgroundColor
  );


  if (
    s.backgroundImage
  ) {

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


  setText(
    "brandIcon",
    s.logoText || "T"
  );


  setText(
    "welcomeLogo",
    s.logoText || "T"
  );


  document.title =
    s.siteName ||
    "T.M.D AI";


  if (
    !s.showDeveloper
  ) {

    const developer =
      document.getElementById(
        "developer"
      );

    if (developer) {
      developer.style.display =
        "none";
    }

  }


  if (
    !s.showSuggestions
  ) {

    document
      .querySelectorAll(
        ".suggestion, .welcome-cards"
      )
      .forEach(
        element => {
          element.style.display =
            "none";
        }
      );

  }


  if (
    !s.showWelcome &&
    welcome
  ) {

    welcome.style.display =
      "none";

  }


  if (
    !s.enableImageTools
  ) {

    if (plusButton) {
      plusButton.style.display =
        "none";
    }

  } else {

    if (plusButton) {
      plusButton.style.display =
        "inline-flex";
    }

  }
}


/* =========================
   جلب الإعدادات
========================= */

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
      data.ok &&
      data.settings
    ) {

      applySettings(
        data.settings
      );

      return;

    }

  } catch (error) {

    console.warn(
      "Settings request failed:",
      error
    );

  }


  applySettings(
    DEFAULT_SETTINGS
  );
}


/* =========================
   فتح لوحة المالك
========================= */

async function openOwnerPanel() {

  if (!ownerModal) {
    return;
  }


  ownerModal.hidden =
    false;


  if (
    state.ownerToken
  ) {

    showOwnerPanel();

    await loadOwnerSettings();

  } else {

    showOwnerLogin();

  }


  setTimeout(
    () => {
      ownerPassword?.focus();
    },
    50
  );
}


/* =========================
   إغلاق لوحة المالك
========================= */

function closeOwnerPanel() {

  if (ownerModal) {
    ownerModal.hidden =
      true;
  }

}


/* =========================
   واجهة تسجيل المالك
========================= */

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


/* =========================
   واجهة لوحة التحكم
========================= */

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


/* =========================
   تسجيل دخول المالك
========================= */

async function loginOwner(
  event
) {

  event.preventDefault();


  const password =
    ownerPassword?.value.trim();


  if (!password) {

    setOwnerError(
      "أدخل كلمة مرور المالك."
    );

    return;

  }


  setOwnerError(
    ""
  );


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
      !data.ok
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


    ownerPassword.value =
      "";


    showOwnerPanel();

    await loadOwnerSettings();


  } catch (error) {

    setOwnerError(
      error.message ||
      "تعذر تسجيل الدخول."
    );

  }
}


/* =========================
   خطأ تسجيل الدخول
========================= */

function setOwnerError(
  message
) {

  if (ownerLoginError) {

    ownerLoginError.textContent =
      message || "";

  }
}


/* =========================
   جلب إعدادات المالك
========================= */

async function loadOwnerSettings() {

  if (
    !state.ownerToken
  ) {
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
      return;
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
      "Load owner settings error:",
      error
    );

  }
}


/* =========================
   تعبئة نموذج الإعدادات
========================= */

function fillSettingsForm(
  settings
) {

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

  if (settingPrimaryColor) {
    settingPrimaryColor.value =
      settings.primaryColor ||
      "#c9a227";
  }

  if (settingBackgroundColor) {
    settingBackgroundColor.value =
      settings.backgroundColor ||
      "#faf8f1";
  }

  if (settingLogoText) {
    settingLogoText.value =
      settings.logoText || "T";
  }

  if (settingBackgroundImage) {
    settingBackgroundImage.value =
      settings.backgroundImage || "";
  }
}


/* =========================
   حفظ إعدادات المالك
========================= */

async function saveOwnerSettings() {

  if (
    !state.ownerToken
  ) {

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
      "#ffffff",

    backgroundColor:
      settingBackgroundColor?.value ||
      DEFAULT_SETTINGS.backgroundColor,

    logoText:
      settingLogoText?.value.trim() ||
      DEFAULT_SETTINGS.logoText,

    backgroundImage:
      settingBackgroundImage?.value.trim() ||
      ""
  };


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
            JSON.stringify(
              settings
            )
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

  }
}


/* =========================
   رسالة الإعدادات
========================= */

function showSettingsMessage(
  message,
  isError
) {

  if (!settingsMessage) {
    return;
  }


  settingsMessage.textContent =
    message;


  settingsMessage.classList.toggle(
    "error",
    Boolean(isError)
  );


  setTimeout(
    () => {

      if (settingsMessage) {
        settingsMessage.textContent =
          "";
      }

    },
    4000
  );
}


/* =========================
   تسجيل خروج المالك
========================= */

async function logoutOwner() {

  try {

    if (state.ownerToken) {

      await fetch(
        "/api/owner-logout",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${state.ownerToken}`
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


/* =========================
   الوضع الليلي / الفاتح
========================= */

function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );


  localStorage.setItem(
    "tmd_theme",

    document.body.classList.contains(
      "light"
    )
      ? "light"
      : "dark"
  );
}


/* =========================
   تحميل المظهر
========================= */

function loadTheme() {

  if (
    localStorage.getItem(
      "tmd_theme"
    ) === "light"
  ) {

    document.body.classList.add(
      "light"
    );

  }

}


/* =========================
   Auto Resize
========================= */

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


/* =========================
   Escape HTML
========================= */

function escapeHtml(
  value
) {

  return String(
    value || ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


/* =========================
   Escape CSS URL
========================= */

function escapeCssUrl(
  value
) {

  return String(
    value || ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /"/g,
      '\\"'
    )
    .replace(
      /\)/g,
      "\\)"
    );
}


/* =========================
   Set Text
========================= */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (element) {

    element.textContent =
      value ?? "";

  }
}


/* =========================
   الأحداث
========================= */


/* إرسال */

if (composer) {

  composer.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      sendMessage(
        input.value
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


/* رفع صورة */

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

    }

  }
);


/* الأزرار الجاهزة */

document
  .querySelectorAll(
    "[data-prompt]"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          input.value =
            button.dataset.prompt ||
            "";

          input.focus();

          input.dispatchEvent(
            new Event("input")
          );

        }
      );

    }
  );


/* محادثة جديدة */

const newChatButton =
  document.getElementById(
    "newChat"
  );


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

const clearChat =
  document.getElementById(
    "clearChat"
  );


if (clearChat) {

  clearChat.addEventListener(
    "click",
    () => {

      newChat();

    }
  );

}


/* الوضع */

const themeButton =
  document.getElementById(
    "theme"
  );


if (themeButton) {

  themeButton.addEventListener(
    "click",
    toggleTheme
  );

}


/* قائمة الهاتف */

const menuButton =
  document.getElementById(
    "menuBtn"
  );


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


/* =========================
   تشغيل التطبيق
========================= */

loadTheme();

loadSettings();

render();
