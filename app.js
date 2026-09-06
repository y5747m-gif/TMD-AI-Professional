"use strict";

/* =========================================================
   T.M.D AI
   Frontend - Groq Only
   ========================================================= */

const state = {
  messages: JSON.parse(
    localStorage.getItem("tmd_messages") || "[]"
  ),

  conversations: JSON.parse(
    localStorage.getItem("tmd_conversations") || "[]"
  ),

  theme:
    localStorage.getItem("tmd_theme") || "dark",

  model:
    localStorage.getItem("tmd_model") ||
    "openai/gpt-oss-120b",

  busy: false,

  controller: null,

  selectedImage: null,

  selectedDocument: null,

  imageMode: "analyze"
};


/* =========================================================
   MODELS
   ========================================================= */

const MODELS = {
  fast: "openai/gpt-oss-120b",

  vision: "qwen/qwen3.8-27b",

  smart: "openai/gpt-oss-120b"
};


/* =========================================================
   DOM
   ========================================================= */

let chat;
let welcome;
let input;
let sendButton;
let plusButton;
let plusMenu;

let documentInput;
let imageInput;

let addImageButton;
let analyzeDocumentButton;

let imageEditButton;

let imagePreviewContainer;
let imagePreview;
let imageFileName;
let imageModeLabel;

let removeImage;

let history;
let newChat;

let settingsBtn;
let modalBackdrop;
let modalClose;

let themeSelect;
let modelSelect;
let modelName;
let toast;
let sidebar;

let openSidebar;
let closeSidebar;


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

/* Mobile browser compatibility */
window.addEventListener("pageshow", function () {
  state.busy = false;
  state.controller = null;
  setSendingState(false);
});

window.addEventListener("orientationchange", function () {
  setTimeout(function () {
    if (input) input.focus({ preventScroll: true });
  }, 150);
});


function init() {

  cacheElements();

  applyTheme();

  updateModelUI();

  bindEvents();

  renderHistory();

  renderMessages();

  setupTextarea();

}


/* =========================================================
   CACHE ELEMENTS
   ========================================================= */

function cacheElements() {

  chat =
    document.getElementById("chat");

  welcome =
    document.getElementById("welcome");

  input =
    document.getElementById("input");

  sendButton =
    document.getElementById("send");

  plusButton =
    document.getElementById("plusButton");

  plusMenu =
    document.getElementById("plusMenu");

  documentInput =
    document.getElementById("documentInput");

  imageInput =
    document.getElementById("imageInput");

  addImageButton =
    document.getElementById("addImageButton");

  analyzeDocumentButton =
    document.getElementById(
      "analyzeDocumentButton"
    );

  imageEditButton =
    document.getElementById(
      "imageEditButton"
    );

  imagePreviewContainer =
    document.getElementById(
      "imagePreviewContainer"
    );

  imagePreview =
    document.getElementById(
      "imagePreview"
    );

  imageFileName =
    document.getElementById(
      "imageFileName"
    );

  imageModeLabel =
    document.getElementById(
      "imageModeLabel"
    );

  removeImage =
    document.getElementById(
      "removeImage"
    );

  history =
    document.getElementById(
      "history"
    );

  newChat =
    document.getElementById(
      "newChat"
    );

  settingsBtn =
    document.getElementById(
      "settingsBtn"
    );

  modalBackdrop =
    document.getElementById(
      "modalBackdrop"
    );

  modalClose =
    document.getElementById(
      "modalClose"
    );

  themeSelect =
    document.getElementById(
      "themeSelect"
    );

  modelSelect =
    document.getElementById(
      "modelSelect"
    );

  modelName =
    document.getElementById(
      "modelName"
    );

  toast =
    document.getElementById(
      "toast"
    );

  sidebar =
    document.getElementById(
      "sidebar"
    );

  openSidebar =
    document.getElementById(
      "openSidebar"
    );

  closeSidebar =
    document.getElementById(
      "closeSidebar"
    );

}


/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {

  if (sendButton) {

    sendButton.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        sendMessage();
      }
    );

  }


  if (input) {

    input.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {

          event.preventDefault();

          sendMessage();

        }

      }
    );

  }


  if (plusButton) {

    plusButton.addEventListener(
      "click",
      function (event) {

        event.stopPropagation();

        togglePlusMenu();

      }
    );

  }


  document.addEventListener(
    "click",
    function (event) {

      if (
        plusMenu &&
        !plusMenu.contains(event.target) &&
        event.target !== plusButton
      ) {

        closePlusMenu();

      }

    }
  );


  if (addImageButton) {

    addImageButton.addEventListener(
      "click",
      function () {

        closePlusMenu();

        if (imageInput) {
          imageInput.click();
        }

      }
    );

  }


  if (imageInput) {

    imageInput.addEventListener(
      "change",
      handleImageSelection
    );

  }


  if (documentInput) {

    documentInput.addEventListener(
      "change",
      handleDocumentSelection
    );

  }


  if (analyzeDocumentButton) {

    analyzeDocumentButton.addEventListener(
      "click",
      function () {

        closePlusMenu();

        if (documentInput) {
          documentInput.click();
        }

      }
    );

  }


  if (removeImage) {

    removeImage.addEventListener(
      "click",
      removeSelectedImage
    );

  }


  if (imageEditButton) {

    imageEditButton.addEventListener(
      "click",
      function () {

        state.imageMode = "edit";

        updateImageMode();

      }
    );

  }


  if (newChat) {

    newChat.addEventListener(
      "click",
      createNewChat
    );

  }


  if (settingsBtn) {

    settingsBtn.addEventListener(
      "click",
      openSettings
    );

  }


  if (modalClose) {

    modalClose.addEventListener(
      "click",
      closeSettings
    );

  }


  if (modalBackdrop) {

    modalBackdrop.addEventListener(
      "click",
      function (event) {

        if (
          event.target === modalBackdrop
        ) {

          closeSettings();

        }

      }
    );

  }


  if (themeSelect) {

    themeSelect.addEventListener(
      "change",
      function () {

        state.theme =
          themeSelect.value;

        localStorage.setItem(
          "tmd_theme",
          state.theme
        );

        applyTheme();

      }
    );

  }


  if (modelSelect) {

    modelSelect.addEventListener(
      "change",
      function () {

        const value =
          modelSelect.value;

        if (
          value === MODELS.fast ||
          value === MODELS.vision
        ) {

          state.model = value;

        } else {

          state.model =
            MODELS.fast;

        }

        localStorage.setItem(
          "tmd_model",
          state.model
        );

        updateModelUI();

      }
    );

  }


  if (openSidebar) {

    openSidebar.addEventListener(
      "click",
      function () {

        if (sidebar) {
          sidebar.classList.add(
            "open"
          );
        }

      }
    );

  }


  if (closeSidebar) {

    closeSidebar.addEventListener(
      "click",
      function () {

        if (sidebar) {
          sidebar.classList.remove(
            "open"
          );
        }

      }
    );

  }

}


/* =========================================================
   TEXTAREA
   ========================================================= */

function setupTextarea() {

  if (!input) {
    return;
  }

  input.addEventListener(
    "input",
    function () {

      input.style.height =
        "auto";

      input.style.height =
        Math.min(
          input.scrollHeight,
          180
        ) + "px";

    }
  );

}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme() {

  document.documentElement.dataset.theme =
    state.theme;

  document.body.dataset.theme =
    state.theme;

  if (themeSelect) {
    themeSelect.value =
      state.theme;
  }

}


/* =========================================================
   MODEL UI
   ========================================================= */

function updateModelUI() {

  if (modelSelect) {

    modelSelect.value =
      state.model;

  }

  if (!modelName) {
    return;
  }

  if (
    state.model ===
    MODELS.vision
  ) {

    modelName.textContent =
      "T.M.D Vision";

  } else {

    modelName.textContent =
      "T.M.D Fast";

  }

}


/* =========================================================
   PLUS MENU
   ========================================================= */

function togglePlusMenu() {

  if (!plusMenu) {
    return;
  }

  plusMenu.classList.toggle(
    "open"
  );

}


function closePlusMenu() {

  if (!plusMenu) {
    return;
  }

  plusMenu.classList.remove(
    "open"
  );

}


/* =========================================================
   IMAGE
   ========================================================= */

async function handleImageSelection(
  event
) {

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

    showToast(
      "الملف المحدد ليس صورة."
    );

    return;

  }


  if (
    file.size >
    20 * 1024 * 1024
  ) {

    showToast(
      "حجم الصورة أكبر من 20MB."
    );

    return;

  }


  try {

    const dataURL =
      await prepareImageForUpload(file);

    state.selectedImage = {
      file,
      dataURL,
      name: file.name,
      type: "image/jpeg"
    };

    state.imageMode =
      "analyze";

    showImagePreview();

    updateImageMode();

  } catch (error) {

    console.error(
      error
    );

    showToast(
      "تعذر قراءة الصورة."
    );

  }

}


/* =========================================================
   SHOW IMAGE
   ========================================================= */

function showImagePreview() {

  if (!state.selectedImage) {
    return;
  }

  if (imagePreview) {

    imagePreview.src =
      state.selectedImage.dataURL;

  }

  if (imageFileName) {

    imageFileName.textContent =
      state.selectedImage.name;

  }

  if (imagePreviewContainer) {

    imagePreviewContainer.classList.add(
      "show"
    );

  }

}


/* =========================================================
   IMAGE MODE
   ========================================================= */

function updateImageMode() {

  if (!imageModeLabel) {
    return;
  }

  if (
    state.imageMode ===
    "edit"
  ) {

    imageModeLabel.textContent =
      "تعديل الصورة";

  } else {

    imageModeLabel.textContent =
      "تحليل الصورة";

  }

}


/* =========================================================
   REMOVE IMAGE
   ========================================================= */

function removeSelectedImage() {

  state.selectedImage =
    null;

  state.imageMode =
    "analyze";

  if (imageInput) {
    imageInput.value = "";
  }

  if (imagePreview) {
    imagePreview.removeAttribute(
      "src"
    );
  }

  if (imagePreviewContainer) {

    imagePreviewContainer.classList.remove(
      "show"
    );

  }

}


/* =========================================================
   DOCUMENT
   ========================================================= */

async function handleDocumentSelection(
  event
) {

  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }


  try {

    const result =
      await readDocument(
        file
      );

    state.selectedDocument = {
      file,
      name: file.name,
      type: file.type,
      text: result
    };

    showToast(
      `تم تجهيز الملف: ${file.name}`
    );

    if (input) {

      if (!input.value.trim()) {

        input.value =
          `حلل هذا الملف واذكر أهم المعلومات الموجودة فيه.`;

      }

      input.focus();

    }

  } catch (error) {

    console.error(
      error
    );

    state.selectedDocument =
      null;

    showToast(
      error.message ||
      "تعذر قراءة الملف."
    );

  }


  event.target.value = "";

}


/* =========================================================
   READ DOCUMENT
   ========================================================= */

async function readDocument(
  file
) {

  const maxSize =
    10 * 1024 * 1024;

  if (
    file.size >
    maxSize
  ) {

    throw new Error(
      "حجم الملف أكبر من 10MB."
    );

  }


  const name =
    file.name.toLowerCase();

  const supported =
    [
      ".txt",
      ".md",
      ".csv",
      ".json",
      ".html",
      ".htm",
      ".css",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".xml",
      ".log"
    ];


  const extension =
    supported.find(
      ext =>
        name.endsWith(ext)
    );


  if (!extension) {

    throw new Error(
      "هذه النسخة تدعم الملفات النصية مثل TXT وMD وCSV وJSON وHTML وCSS وJS."
    );

  }


  return await file.text();

}


/* =========================================================
   FILE -> DATA URL
   ========================================================= */

async function prepareImageForUpload(file) {

  const MAX_SIDE = 1600;
  const QUALITY = 0.78;
  const MAX_BYTES = 5 * 1024 * 1024;

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let dataURL = canvas.toDataURL("image/jpeg", QUALITY);
      if (dataURL.length * 0.75 > MAX_BYTES) {
        dataURL = canvas.toDataURL("image/jpeg", 0.62);
      }
      return dataURL;
    } catch (e) {
      console.warn("createImageBitmap failed; using FileReader", e);
    }
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.onerror = () => reject(new Error("تعذر معالجة الصورة على هذا الجهاز."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });
}


function fileToDataURL(
  file
) {

  return new Promise(
    function (
      resolve,
      reject
    ) {

      const reader =
        new FileReader();

      reader.onload =
        () =>
          resolve(
            reader.result
          );

      reader.onerror =
        () =>
          reject(
            new Error(
              "FileReader error"
            )
          );

      reader.readAsDataURL(
        file
      );

    }
  );

}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage() {

  if (state.busy) {
    return;
  }

  const text =
    input?.value?.trim() ||
    "";


  if (
    !text &&
    !state.selectedImage &&
    !state.selectedDocument
  ) {

    return;

  }


  state.busy =
    true;

  state.controller =
    new AbortController();


  setSendingState(
    true
  );


  try {

    /*
     * إنشاء رسالة المستخدم محليًا.
     *
     * مهم:
     * لا نرسل imagePreview
     * ولا file object
     * ولا أي بيانات خاصة بالواجهة
     * إلى Groq.
     */

    const userMessage = {
      role: "user",
      content: text
    };


    /*
     * حفظ الصورة والملف محليًا
     * لعرضهما في المحادثة.
     */

    if (
      state.selectedImage
    ) {

      userMessage.image =
        state.selectedImage.dataURL;

      userMessage.imageName =
        state.selectedImage.name;

    }


    if (
      state.selectedDocument
    ) {

      userMessage.fileName =
        state.selectedDocument.name;

      userMessage.fileText =
        state.selectedDocument.text;

    }


    state.messages.push(
      userMessage
    );


    saveMessages();

    renderMessages();


    /*
     * مسح صندوق الكتابة
     */

    if (input) {

      input.value =
        "";

      input.style.height =
        "auto";

    }


    /*
     * تجهيز الرسائل التي سيتم إرسالها
     * إلى Backend.
     */

    const apiMessages =
      buildApiMessages();


    /*
     * تحديد الموديل.
     *
     * إذا توجد صورة:
     * نستخدم موديل Vision.
     */

    const hasImage =
      Boolean(
        state.selectedImage
      );


    const model =
      hasImage
        ? MODELS.vision
        : state.model;


    /*
     * إظهار رسالة انتظار
     */

    const loadingId =
      addLoadingMessage();


    /*
     * إرسال الطلب إلى:
     *
     * /api/chat
     *
     * وليس مباشرة إلى Groq.
     *
     * مفتاح GROQ_API_KEY يبقى في Vercel.
     */

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
              model,
              messages:
                apiMessages
            }),

          signal:
            state.controller.signal
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    removeLoadingMessage(
      loadingId
    );


    if (!response.ok) {

      throw new Error(
        data?.error ||
        `خطأ من الخادم: ${response.status}`
      );

    }


    if (
      !data?.ok
    ) {

      throw new Error(
        data?.error ||
        "لم يتم الحصول على رد من Groq."
      );

    }


    let reply =
      typeof data.reply ===
      "string"
        ? data.reply
        : "";


    /*
     * حماية إضافية:
     * إزالة أي reasoning ظهر
     * بالخطأ داخل النص.
     */

    reply =
      cleanAssistantReply(
        reply
      );


    if (!reply) {

      throw new Error(
        "Groq لم يرجع إجابة نصية."
      );

    }


    /*
     * حفظ رد المساعد.
     */

    state.messages.push({
      role: "assistant",
      content: reply
    });


    saveMessages();

    renderMessages();

    saveConversation();


  } catch (error) {

    console.error(
      "T.M.D AI Error:",
      error
    );


    if (
      error.name ===
      "AbortError"
    ) {

      showToast(
        "تم إيقاف الطلب."
      );

    } else {

      showToast(
        error.message ||
        "حدث خطأ أثناء إرسال الرسالة."
      );

      addErrorMessage(
        error.message ||
        "حدث خطأ أثناء الاتصال بـ Groq."
      );

    }

  } finally {

    state.busy =
      false;

    state.controller =
      null;

    setSendingState(
      false
    );


    /*
     * حذف الصورة والملف بعد الإرسال.
     */

    removeSelectedImage();

    state.selectedDocument =
      null;

  }

}


/* =========================================================
   BUILD API MESSAGES
   ========================================================= */

function buildApiMessages() {

  const result = [];


  /*
   * نرسل آخر رسائل المحادثة فقط
   * لتقليل الحجم.
   */

  const historyMessages =
    state.messages
      .slice(-30);


  for (
    const message
    of historyMessages
  ) {

    if (
      message.role !==
        "user" &&
      message.role !==
        "assistant"
    ) {

      continue;

    }


    /*
     * رسالة المستخدم تحتوي على صورة
     */

    if (
      message.role ===
        "user" &&
      message.image
    ) {

      result.push({

        role: "user",

        content: [

          {
            type: "text",

            text:
              message.content ||
              "حلل هذه الصورة."
          },

          {
            type:
              "image_url",

            image_url: {
              url:
                message.image
            }

          }

        ]

      });

      continue;

    }


    /*
     * رسالة المستخدم تحتوي على ملف
     */

    if (
      message.role ===
        "user" &&
      message.fileText
    ) {

      const fileText =
        truncateText(
          message.fileText,
          100000
        );


      result.push({

        role: "user",

        content:
          `${message.content || "حلل الملف."}

اسم الملف:
${message.fileName || "file"}

محتوى الملف:
--- BEGIN FILE ---
${fileText}
--- END FILE ---`

      });

      continue;

    }


    /*
     * الرسائل العادية
     */

    result.push({

      role:
        message.role,

      content:
        typeof message.content ===
        "string"
          ? message.content
          : ""

    });

  }


  return result;

}


/* =========================================================
   CLEAN REPLY
   ========================================================= */

function cleanAssistantReply(
  text
) {

  if (
    typeof text !==
    "string"
  ) {

    return "";

  }


  let result =
    text;


  /*
   * إزالة <think>...</think>
   */

  result =
    result.replace(
      /<think>[\s\S]*?<\/think>/gi,
      ""
    );


  /*
   * إزالة أي think غير مغلق
   */

  result =
    result.replace(
      /<think>[\s\S]*$/gi,
      ""
    );


  /*
   * إزالة علامات reasoning
   */

  result =
    result.replace(
      /^\s*reasoning\s*:\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*analysis\s*:\s*/i,
      ""
    );


  /*
   * إزالة عناوين التفكير التي قد تظهر
   * من نموذج غير مضبوط.
   */

  result =
    result.replace(
      /^\s*here's a thinking process\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*let me think\s*:?\s*/i,
      ""
    );


  /*
   * إزالة المسافات الزائدة.
   */

  result =
    result.trim();


  return result;

}


/* =========================================================
   RENDER MESSAGES
   ========================================================= */

function renderMessages() {

  if (!chat) {
    return;
  }


  chat.innerHTML =
    "";


  if (
    !state.messages.length
  ) {

    if (welcome) {

      welcome.style.display =
        "";

      chat.appendChild(
        welcome
      );

    }

    return;

  }


  if (welcome) {

    welcome.style.display =
      "none";

  }


  for (
    const message
    of state.messages
  ) {

    renderMessage(
      message
    );

  }


  scrollToBottom();

}


/* =========================================================
   RENDER MESSAGE
   ========================================================= */

function renderMessage(
  message
) {

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    `message ${
      message.role
    }`;


  const avatar =
    document.createElement(
      "div"
    );


  avatar.className =
    "message-avatar";


  avatar.textContent =
    message.role ===
    "user"
      ? "أنت"
      : "T";


  const content =
    document.createElement(
      "div"
    );


  content.className =
    "message-content";


  /*
   * صورة المستخدم
   */

  if (
    message.image
  ) {

    const img =
      document.createElement(
        "img"
      );

    img.src =
      message.image;

    img.alt =
      message.imageName ||
      "صورة";

    img.className =
      "message-image";

    content.appendChild(
      img
    );

  }


  /*
   * اسم الملف
   */

  if (
    message.fileName
  ) {

    const fileBox =
      document.createElement(
        "div"
      );

    fileBox.className =
      "message-file";

    fileBox.textContent =
      `📎 ${message.fileName}`;

    content.appendChild(
      fileBox
    );

  }


  /*
   * النص
   */

  if (
    message.content
  ) {

    const text =
      document.createElement(
        "div"
      );

    text.className =
      "message-text";

    text.innerHTML =
      renderMarkdown(
        message.content
      );

    content.appendChild(
      text
    );

  }


  wrapper.appendChild(
    avatar
  );

  wrapper.appendChild(
    content
  );


  chat.appendChild(
    wrapper
  );

}


/* =========================================================
   MARKDOWN
   ========================================================= */

function renderMarkdown(
  text
) {

  let html =
    escapeHTML(
      text
    );


  /*
   * Code blocks
   */

  html =
    html.replace(
      /```([\s\S]*?)```/g,
      function (
        match,
        code
      ) {

        return (
          "<pre><code>" +
          code.trim() +
          "</code></pre>"
        );

      }
    );


  /*
   * Inline code
   */

  html =
    html.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );


  /*
   * Bold
   */

  html =
    html.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );


  /*
   * Headings
   */

  html =
    html.replace(
      /^### (.*)$/gm,
      "<h3>$1</h3>"
    );

  html =
    html.replace(
      /^## (.*)$/gm,
      "<h2>$1</h2>"
    );

  html =
    html.replace(
      /^# (.*)$/gm,
      "<h1>$1</h1>"
    );


  /*
   * Lists
   */

  html =
    html.replace(
      /^\s*[-*] (.*)$/gm,
      "<li>$1</li>"
    );


  /*
   * Line breaks
   */

  html =
    html.replace(
      /\n/g,
      "<br>"
    );


  return html;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(
  text
) {

  return String(text)
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


/* =========================================================
   LOADING MESSAGE
   ========================================================= */

let loadingCounter =
  0;


function addLoadingMessage() {

  if (!chat) {
    return null;
  }


  const id =
    `loading-${++loadingCounter}`;


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.id =
    id;


  wrapper.className =
    "message assistant loading";


  const avatar =
    document.createElement(
      "div"
    );


  avatar.className =
    "message-avatar";

  avatar.textContent =
    "T";


  const content =
    document.createElement(
      "div"
    );


  content.className =
    "message-content";


  content.innerHTML =
    `
      <div class="typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;


  wrapper.appendChild(
    avatar
  );

  wrapper.appendChild(
    content
  );


  chat.appendChild(
    wrapper
  );


  scrollToBottom();


  return id;

}


function removeLoadingMessage(
  id
) {

  if (!id) {
    return;
  }


  const element =
    document.getElementById(
      id
    );


  if (element) {
    element.remove();
  }

}


/* =========================================================
   ERROR MESSAGE
   ========================================================= */

function addErrorMessage(
  message
) {

  if (!chat) {
    return;
  }


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "message assistant error";


  const avatar =
    document.createElement(
      "div"
    );


  avatar.className =
    "message-avatar";

  avatar.textContent =
    "T";


  const content =
    document.createElement(
      "div"
    );


  content.className =
    "message-content";


  content.textContent =
    message;


  wrapper.appendChild(
    avatar
  );

  wrapper.appendChild(
    content
  );


  chat.appendChild(
    wrapper
  );


  scrollToBottom();

}


/* =========================================================
   SEND STATE
   ========================================================= */

function setSendingState(
  sending
) {

  if (sendButton) {

    sendButton.disabled =
      sending;

  }


  if (input) {

    input.disabled =
      sending;

  }


  if (
    sending &&
    sendButton
  ) {

    sendButton.dataset.oldText =
      sendButton.textContent;

    sendButton.textContent =
      "…";

  }


  if (
    !sending &&
    sendButton
  ) {

    sendButton.textContent =
      sendButton.dataset.oldText ||
      "↑";

  }

}


/* =========================================================
   STOP REQUEST
   ========================================================= */

function stopRequest() {

  if (
    state.controller
  ) {

    state.controller.abort();

  }

}


/* =========================================================
   SCROLL
   ========================================================= */

function scrollToBottom() {

  requestAnimationFrame(
    function () {

      window.scrollTo({
        top:
          document.body.scrollHeight,

        behavior:
          "smooth"
      });

    }
  );

}


/* =========================================================
   STORAGE
   ========================================================= */

function saveMessages() {

  /*
   * لا نخزن fileText الطويل جدًا
   * في localStorage.
   */

  const clean =
    state.messages.map(
      message => {

        const copy =
          {
            ...message
          };


        if (
          copy.fileText
        ) {

          delete copy.fileText;

        }


        return copy;

      }
    );


  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(
      clean
    )
  );

}


/* =========================================================
   CONVERSATIONS
   ========================================================= */

function saveConversation() {

  if (
    !state.messages.length
  ) {

    return;

  }


  const firstUserMessage =
    state.messages.find(
      message =>
        message.role ===
        "user"
    );


  if (
    !firstUserMessage
  ) {

    return;

  }


  const title =
    (
      firstUserMessage.content ||
      "محادثة جديدة"
    )
      .replace(
        /\s+/g,
        " "
      )
      .slice(
        0,
        60
      );


  const conversation = {
    id:
      Date.now(),

    title,

    messages:
      state.messages.map(
        message => ({
          role:
            message.role,

          content:
            message.content ||
            "",

          image:
            message.image ||
            null,

          imageName:
            message.imageName ||
            null,

          fileName:
            message.fileName ||
            null
        })
      ),

    updatedAt:
      new Date().toISOString()

  };


  /*
   * تحديث آخر محادثة بدل إنشاء
   * نسخة جديدة مع كل رسالة.
   */

  const last =
    state.conversations[0];


  if (
    last &&
    !last.messages.length
  ) {

    state.conversations[0] =
      conversation;

  } else {

    state.conversations =
      [
        conversation,
        ...state.conversations
      ].slice(
        0,
        50
      );

  }


  localStorage.setItem(
    "tmd_conversations",
    JSON.stringify(
      state.conversations
    )
  );


  renderHistory();

}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

  if (!history) {
    return;
  }


  history.innerHTML =
    "";


  if (
    !state.conversations.length
  ) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "history-empty";

    empty.textContent =
      "لا توجد محادثات محفوظة";

    history.appendChild(
      empty
    );

    return;

  }


  for (
    const conversation
    of state.conversations
  ) {

    const item =
      document.createElement(
        "button"
      );


    item.className =
      "history-item";


    item.textContent =
      conversation.title ||
      "محادثة";


    item.addEventListener(
      "click",
      function () {

        loadConversation(
          conversation.id
        );

      }
    );


    history.appendChild(
      item
    );

  }

}


/* =========================================================
   LOAD CONVERSATION
   ========================================================= */

function loadConversation(
  id
) {

  const conversation =
    state.conversations.find(
      item =>
        item.id === id
    );


  if (!conversation) {
    return;
  }


  state.messages =
    Array.isArray(
      conversation.messages
    )
      ? conversation.messages
      : [];


  saveMessages();

  renderMessages();


  if (sidebar) {

    sidebar.classList.remove(
      "open"
    );

  }

}


/* =========================================================
   NEW CHAT
   ========================================================= */

function createNewChat() {

  if (
    state.busy
  ) {

    stopRequest();

  }


  state.messages =
    [];


  state.selectedImage =
    null;


  state.selectedDocument =
    null;


  localStorage.removeItem(
    "tmd_messages"
  );


  removeSelectedImage();

  renderMessages();


  if (input) {

    input.value =
      "";

    input.focus();

  }

}


/* =========================================================
   SETTINGS
   ========================================================= */

function openSettings() {

  if (!modalBackdrop) {
    return;
  }

  modalBackdrop.classList.add(
    "show"
  );

}


function closeSettings() {

  if (!modalBackdrop) {
    return;
  }

  modalBackdrop.classList.remove(
    "show"
  );

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
  message
) {

  if (!toast) {

    console.log(
      message
    );

    return;

  }


  toast.textContent =
    message;


  toast.classList.add(
    "show"
  );


  clearTimeout(
    showToast.timer
  );


  showToast.timer =
    setTimeout(
      function () {

        toast.classList.remove(
          "show"
        );

      },
      3500
    );

}


/* =========================================================
   TRUNCATE
   ========================================================= */

function truncateText(
  text,
  max
) {

  if (
    typeof text !==
    "string"
  ) {

    return "";

  }


  if (
    text.length <= max
  ) {

    return text;

  }


  return (
    text.slice(
      0,
      max
    ) +
    "\n\n[تم اختصار الملف بسبب الحجم]"
  );

}


/* =========================================================
   OPTIONAL GLOBAL FUNCTIONS
   ========================================================= */

window.TMDAI = {

  sendMessage,

  stopRequest,

  newChat:
    createNewChat,

  removeImage:
    removeSelectedImage,

  togglePlusMenu,

  loadConversation

};


/* =========================================================
   INITIAL MODEL SAFETY
   ========================================================= */

if (
  state.model !== MODELS.fast &&
  state.model !== MODELS.vision &&
  state.model !== "openai/gpt-oss-20b" &&
  state.model !== "qwen/qwen3.6-27b" &&
  state.model !== "qwen/qwen3.8-27b"
) {

  state.model =
    MODELS.fast;

  localStorage.setItem(
    "tmd_model",
    state.model
  );

}
