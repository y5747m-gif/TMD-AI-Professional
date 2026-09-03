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

  ownerToken:
    sessionStorage.getItem("tmd_owner_token") || "",

  settings: null
};


/* =========================
   الإعدادات الافتراضية
========================= */

const DEFAULT_SETTINGS = {

  siteName: "T.M.D AI",

  siteDescription: "المساعد الذكي",

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
    true,

  suggestions: [

    {
      title: "شرح الذكاء الاصطناعي",
      icon: "🤖",
      prompt:
        "اشرح لي الذكاء الاصطناعي بطريقة بسيطة"
    },

    {
      title: "اكتب كود",
      icon: "💻",
      prompt:
        "اكتب لي كود HTML احترافي"
    },

    {
      title: "حل مسألة",
      icon: "🧮",
      prompt:
        "حل لي هذه المسألة خطوة بخطوة"
    },

    {
      title: "سؤال ديني",
      icon: "📖",
      prompt:
        "اشرح لي هذه المسألة الدينية مع ذكر المصادر المؤكدة فقط"
    }

  ]

};


/* =========================
   العناصر
========================= */

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

const ownerButton =
  document.getElementById("ownerButton");

const topOwnerButton =
  document.getElementById("topOwnerButton");

const ownerModal =
  document.getElementById("ownerModal");

const closeOwnerModal =
  document.getElementById("closeOwnerModal");

const ownerLoginSection =
  document.getElementById(
    "ownerLoginSection"
  );

const ownerPanelSection =
  document.getElementById(
    "ownerPanelSection"
  );

const ownerLoginForm =
  document.getElementById(
    "ownerLoginForm"
  );

const ownerPassword =
  document.getElementById(
    "ownerPassword"
  );

const ownerLoginError =
  document.getElementById(
    "ownerLoginError"
  );

const ownerLogout =
  document.getElementById(
    "ownerLogout"
  );

const saveSettingsButton =
  document.getElementById(
    "saveSettings"
  );

const settingsMessage =
  document.getElementById(
    "settingsMessage"
  );

const settingSiteName =
  document.getElementById(
    "settingSiteName"
  );

const settingDescription =
  document.getElementById(
    "settingDescription"
  );

const settingDeveloper =
  document.getElementById(
    "settingDeveloper"
  );

const settingPrimaryColor =
  document.getElementById(
    "settingPrimaryColor"
  );

const settingBackgroundColor =
  document.getElementById(
    "settingBackgroundColor"
  );

const settingLogoText =
  document.getElementById(
    "settingLogoText"
  );

const settingBackgroundImage =
  document.getElementById(
    "settingBackgroundImage"
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

const suggestionsEditor =
  document.getElementById(
    "suggestionsEditor"
  );

const addSuggestionButton =
  document.getElementById(
    "addSuggestion"
  );


/* =========================
   حفظ الرسائل
========================= */

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
   Escape
========================= */

function escapeHtml(value) {

  return String(value || "")

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
   إضافة رسالة
========================= */

function addMessage(
  role,
  text,
  isError = false
) {

  if (!chat) {
    return;
  }

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
        : "grid";

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
   إرسال رسالة
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


  typing.innerHTML = `

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


  chat.appendChild(typing);

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
   قائمة +
========================= */

function togglePlusMenu() {

  if (!plusMenu) {
    return;
  }


  const open =
    plusMenu.classList.contains(
      "show"
    );


  plusMenu.classList.toggle(
    "show",
    !open
  );


  plusMenu.setAttribute(
    "aria-hidden",
    open ? "true" : "false"
  );


  plusButton?.setAttribute(
    "aria-expanded",
    open ? "false" : "true"
  );

}


/* =========================
   فتح اختيار الصورة
========================= */

function openImagePicker(
  mode
) {

  state.imageMode =
    mode;


  plusMenu?.classList.remove(
    "show"
  );


  plusButton?.setAttribute(
    "aria-expanded",
    "false"
  );


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


      reader.readAsDataURL(file);

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


  const allowed =
    [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];


  if (
    !allowed.includes(
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
    10 * 1024 * 1024
  ) {

    alert(
      "حجم الصورة يجب ألا يتجاوز 10MB."
    );

    return;

  }


  try {

    const dataUrl =
      await readImageFile(file);


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


    input.focus();


  } catch (error) {

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

        ? "أريد تعديل هذه الصورة. حلل الصورة أولًا ووضح بالتفصيل التعديلات التي ينبغي تنفيذها."

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


  typing.innerHTML = `

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


  chat.appendChild(typing);

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
   إنشاء الاقتراحات
========================= */

function renderSuggestions(
  suggestions
) {

  const container =
    document.getElementById(
      "sidebarSuggestions"
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


  suggestions.forEach(
    suggestion => {

      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";

      button.className =
        "suggestion";


      button.dataset.prompt =
        suggestion.prompt;


      button.textContent =
        `${suggestion.icon || "💡"} ${
          suggestion.title
        }`;


      button.addEventListener(
        "click",
        () => {

          input.value =
            suggestion.prompt;

          input.focus();

          resizeInput();

        }
      );


      container.appendChild(
        button
      );

    }
  );

}


/* =========================
   تطبيق الإعدادات
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


  document.documentElement.style.setProperty(
    "--secondary-color",
    s.secondaryColor
  );


  if (s.backgroundImage) {

    document.body.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,.20),rgba(0,0,0,.20)),url("${escapeCssUrl(
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
    `${s.siteName || "T.M.D AI"} — المساعد الذكي`;


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


  const welcomeCards =
    document.getElementById(
      "welcomeCards"
    );


  if (welcomeCards) {

    welcomeCards.style.display =
      s.showSuggestions
        ? "flex"
        : "none";

  }


  if (welcome) {

    welcome.style.display =
      s.showWelcome &&
      !state.messages.length
        ? "grid"
        : "none";

  }


  if (plusButton) {

    plusButton.style.display =
      s.enableImageTools
        ? "inline-flex"
        : "none";

  }


  renderSuggestions(
    Array.isArray(s.suggestions)
      ? s.suggestions
      : DEFAULT_SETTINGS.suggestions
  );

}


/* =========================
   تحميل الإعدادات
========================= */

async function loadSettings() {

  try {

    const response =
      await fetch(
        "/api/settings",
        {
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
        data.settings
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


/* =========================
   لوحة المالك
========================= */

function openOwnerPanel() {

  if (!ownerModal) {
    return;
  }


  ownerModal.hidden =
    false;


  if (state.ownerToken) {

    showOwnerPanel();

    loadOwnerSettings();

  } else {

    showOwnerLogin();

  }

}


function closeOwnerPanel() {

  if (ownerModal) {

    ownerModal.hidden =
      true;

  }

}


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
      !data.ok
    ) {

      throw new Error(
        data.error ||
        "كلمة المرور غير صحيحة."
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


function setOwnerError(
  message
) {

  if (ownerLoginError) {

    ownerLoginError.textContent =
      message || "";

  }

}


/* =========================
   تحميل إعدادات المالك
========================= */

async function loadOwnerSettings() {

  try {

    const response =
      await fetch(
        "/api/settings",
        {
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
      "Owner settings error:",
      error
    );

  }

}


/* =========================
   نموذج الإعدادات
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
      settings.developerName ||
      "ياسين عمرو عبد الرحيم";

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
      settings.logoText ||
      "T";

  }


  if (settingBackgroundImage) {

    settingBackgroundImage.value =
      settings.backgroundImage ||
      "";

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


  renderSuggestionsEditor(
    Array.isArray(settings.suggestions)
      ? settings.suggestions
      : DEFAULT_SETTINGS.suggestions
  );

}


/* =========================
   محرر الاقتراحات
========================= */

function renderSuggestionsEditor(
  suggestions
) {

  if (!suggestionsEditor) {
    return;
  }


  suggestionsEditor.innerHTML =
    "";


  suggestions.forEach(
    (item, index) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "suggestion-editor-row";


      row.innerHTML = `

        <input
          class="suggestion-icon"
          value="${escapeHtml(
            item.icon || "💡"
          )}"
          maxlength="4"
          placeholder="💡"
        >

        <input
          class="suggestion-title"
          value="${escapeHtml(
            item.title || ""
          )}"
          placeholder="عنوان الاقتراح"
        >

        <input
          class="suggestion-prompt"
          value="${escapeHtml(
            item.prompt || ""
          )}"
          placeholder="الأمر الذي سيرسل للذكاء الاصطناعي"
        >

        <button
          type="button"
          class="delete-suggestion"
          data-index="${index}"
        >
          ×
        </button>

      `;


      suggestionsEditor.appendChild(
        row
      );

    }
  );


  suggestionsEditor
    .querySelectorAll(
      ".delete-suggestion"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            button
              .closest(
                ".suggestion-editor-row"
              )
              ?.remove();

          }
        );

      }
    );

}


/* =========================
   إضافة اقتراح
========================= */

function addSuggestion() {

  const current =
    getSuggestionsFromEditor();


  current.push({

    title:
      "اقتراح جديد",

    icon:
      "💡",

    prompt:
      "اكتب طلبك هنا"

  });


  renderSuggestionsEditor(
    current
  );

}


/* =========================
   قراءة الاقتراحات
========================= */

function getSuggestionsFromEditor() {

  if (!suggestionsEditor) {

    return [];

  }


  return [
    ...suggestionsEditor
      .querySelectorAll(
        ".suggestion-editor-row"
      )
  ]
    .map(row => ({

      icon:
        row.querySelector(
          ".suggestion-icon"
        )?.value.trim() ||
        "💡",

      title:
        row.querySelector(
          ".suggestion-title"
        )?.value.trim() ||
        "اقتراح",

      prompt:
        row.querySelector(
          ".suggestion-prompt"
        )?.value.trim() ||
        ""

    }))
    .filter(
      item =>
        item.title &&
        item.prompt
    );

}


/* =========================
   حفظ الإعدادات
========================= */

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
      "ياسين عمرو عبد الرحيم",

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
      "T",

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
      getSuggestionsFromEditor()

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
      response.status === 401
    ) {

      state.ownerToken =
        "";

      sessionStorage.removeItem(
        "tmd_owner_token"
      );

      showOwnerLogin();

      throw new Error(
        "انتهت صلاحية دخول المالك."
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
      data.settings
    );


    showSettingsMessage(
      "تم حفظ الإعدادات بنجاح.",
      false
    );


  } catch (error) {

    showSettingsMessage(
      error.message ||
      "تعذر حفظ الإعدادات.",
      true
    );

  }

}


function showSettingsMessage(
  message,
  error
) {

  if (!settingsMessage) {
    return;
  }


  settingsMessage.textContent =
    message;


  settingsMessage.classList.toggle(
    "error",
    Boolean(error)
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
   خروج المالك
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
   الوضع الليلي
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
   تغيير حجم الكتابة
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
   CSS URL
========================= */

function escapeCssUrl(value) {

  return String(value || "")

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
   تغيير النص
========================= */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(id);


  if (element) {

    element.textContent =
      value ?? "";

  }

}


/* =========================
   الأحداث
========================= */

composer?.addEventListener(
  "submit",
  event => {

    event.preventDefault();

    if (
      state.selectedImage
    ) {

      analyzeSelectedImage();

    } else {

      sendMessage(
        input.value
      );

    }

  }
);


input?.addEventListener(
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


input?.addEventListener(
  "input",
  resizeInput
);


plusButton?.addEventListener(
  "click",
  event => {

    event.stopPropagation();

    togglePlusMenu();

  }
);


imageUploadButton?.addEventListener(
  "click",
  () => {

    openImagePicker(
      "analyze"
    );

  }
);


imageEditButton?.addEventListener(
  "click",
  () => {

    openImagePicker(
      "edit"
    );

  }
);


imageInput?.addEventListener(
  "change",
  handleImageSelection
);


removeImage?.addEventListener(
  "click",
  removeSelectedImage
);


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

      plusButton.setAttribute(
        "aria-expanded",
        "false"
      );

    }

  }
);


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

          resizeInput();

        }
      );

    }
  );


document
  .getElementById(
    "newChat"
  )
  ?.addEventListener(
    "click",
    () => {

      state.messages = [];

      saveMessages();

      render();

      input.focus();

    }
  );


document
  .getElementById(
    "clearChat"
  )
  ?.addEventListener(
    "click",
    () => {

      state.messages = [];

      saveMessages();

      render();

    }
  );


document
  .getElementById(
    "theme"
  )
  ?.addEventListener(
    "click",
    toggleTheme
  );


document
  .getElementById(
    "menuBtn"
  )
  ?.addEventListener(
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


overlay?.addEventListener(
  "click",
  () => {

    sidebar?.classList.remove(
      "open"
    );

    overlay?.classList.remove(
      "show"
    );

  }
);


ownerButton?.addEventListener(
  "click",
  openOwnerPanel
);


topOwnerButton?.addEventListener(
  "click",
  openOwnerPanel
);


closeOwnerModal?.addEventListener(
  "click",
  closeOwnerPanel
);


ownerLoginForm?.addEventListener(
  "submit",
  loginOwner
);


saveSettingsButton?.addEventListener(
  "click",
  saveOwnerSettings
);


ownerLogout?.addEventListener(
  "click",
  logoutOwner
);


addSuggestionButton?.addEventListener(
  "click",
  addSuggestion
);


ownerModal?.addEventListener(
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


/* =========================
   تشغيل
========================= */

loadTheme();

loadSettings();

render();
