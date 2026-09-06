"use strict";


const state = {

  messages:
    JSON.parse(
      localStorage.getItem("tmd_messages") || "[]"
    ),

  conversations:
    JSON.parse(
      localStorage.getItem("tmd_conversations") || "[]"
    ),

  theme:
    localStorage.getItem("tmd_theme") || "dark",

  model:
    localStorage.getItem("tmd_model") ||
    "llama-3.3-70b-versatile",

  busy: false,

  controller: null,

  selectedImage: null,

  selectedDocument: null,

  imageMode: "analyze"

};


const $ = selector =>
  document.querySelector(selector);


const chat =
  $("#chat");

const welcome =
  $("#welcome");

const input =
  $("#input");

const send =
  $("#send");

const historyList =
  $("#history");

const sidebar =
  $("#sidebar");


const plusButton =
  $("#plusButton");

const plusMenu =
  $("#plusMenu");


const analyzeDocumentButton =
  $("#analyzeDocumentButton");

const addImageButton =
  $("#addImageButton");

const imageEditButton =
  $("#imageEditButton");


const imageInput =
  $("#imageInput");

const documentInput =
  $("#documentInput");


const attachmentPreview =
  $("#attachmentPreview");

const attachmentIcon =
  $("#attachmentIcon");

const attachmentName =
  $("#attachmentName");

const attachmentMeta =
  $("#attachmentMeta");


/* ================= SAVE ================= */

function save() {

  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(state.messages)
  );

  localStorage.setItem(
    "tmd_conversations",
    JSON.stringify(state.conversations)
  );

  localStorage.setItem(
    "tmd_theme",
    state.theme
  );

  localStorage.setItem(
    "tmd_model",
    state.model
  );

}


/* ================= TOAST ================= */

function toast(message) {

  const el =
    $("#toast");

  if (!el) return;

  el.textContent =
    message;

  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer =
    setTimeout(
      () =>
        el.classList.remove("show"),
      2800
    );

}


/* ================= ESCAPE ================= */

function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,

    character => ({

      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"

    })[character]

  );

}


/* ================= FORMAT TEXT ================= */

function formatText(text) {

  let s =
    esc(text);


  s =
    s.replace(
      /```([\w+-]*)\n?([\s\S]*?)```/g,

      (_, language, code) =>
        `<pre><code>${code}</code></pre>`

    );


  s =
    s.replace(
      /`([^`]+)`/g,
      '<code class="inline-code">$1</code>'
    );


  s =
    s.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );


  s =
    s.replace(
      /\n/g,
      "<br>"
    );


  return s;

}


/* ================= SCROLL ================= */

function scrollBottom() {

  requestAnimationFrame(
    () => {

      chat.scrollTop =
        chat.scrollHeight;

    }
  );

}


/* ================= PLUS MENU ================= */

function closePlusMenu() {

  plusMenu.classList.add(
    "hidden"
  );

  plusButton.setAttribute(
    "aria-expanded",
    "false"
  );

}


function openPlusMenu() {

  plusMenu.classList.remove(
    "hidden"
  );

  plusButton.setAttribute(
    "aria-expanded",
    "true"
  );

}


/* ================= THEME ================= */

function setTheme(theme) {

  state.theme =
    theme;

  document.documentElement.dataset.theme =
    theme;

  document.body.dataset.theme =
    theme;


  const select =
    $("#themeSelect");

  if (select) {

    select.value =
      theme;

  }


  save();

}
/* ================= RENDER HISTORY ================= */

function renderHistory() {

  if (!historyList) return;

  historyList.innerHTML = "";

  if (!state.conversations.length) {
    return;
  }

  state.conversations.forEach(
    conversation => {

      const item =
        document.createElement("button");

      item.className =
        "history-item";

      if (
        conversation.id ===
        state.currentConversationId
      ) {

        item.classList.add(
          "active"
        );

      }

      item.textContent =
        conversation.title ||
        "محادثة جديدة";

      item.addEventListener(
        "click",
        () => {

          loadConversation(
            conversation.id
          );

        }
      );

      historyList.appendChild(
        item
      );

    }
  );

}


/* ================= NEW CONVERSATION ================= */

function newConversation() {

  if (
    state.messages.length
  ) {

    saveConversation();

  }

  state.messages = [];

  state.currentConversationId =
    null;

  state.selectedImage =
    null;

  state.selectedDocument =
    null;

  state.imageMode =
    "analyze";

  if (input) {

    input.value =
      "";

  }

  clearAttachment();

  renderMessages();

  save();

}


/* ================= CONVERSATION ID ================= */

function createConversationId() {

  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );

}


/* ================= SAVE CONVERSATION ================= */

function saveConversation() {

  if (
    !state.messages.length
  ) {

    return;

  }


  let conversation =
    state.conversations.find(
      item =>
        item.id ===
        state.currentConversationId
    );


  const firstUserMessage =
    state.messages.find(
      message =>
        message.role ===
        "user"
    );


  const title =
    firstUserMessage?.content
      ?.replace(/\s+/g, " ")
      ?.trim()
      ?.slice(0, 60) ||
    "محادثة جديدة";


  if (!conversation) {

    conversation = {

      id:
        createConversationId(),

      title:

        title,

      messages:

        []

    };


    state.conversations.unshift(
      conversation
    );


    state.currentConversationId =
      conversation.id;

  }


  conversation.messages =
    JSON.parse(
      JSON.stringify(
        state.messages
      )
    );


  conversation.title =
    title;


  save();

  renderHistory();

}


/* ================= LOAD CONVERSATION ================= */

function loadConversation(id) {

  const conversation =
    state.conversations.find(
      item =>
        item.id === id
    );


  if (!conversation) {

    return;

  }


  state.currentConversationId =
    conversation.id;


  state.messages =
    Array.isArray(
      conversation.messages
    )

      ? JSON.parse(
          JSON.stringify(
            conversation.messages
          )
        )

      : [];


  save();

  renderMessages();

  renderHistory();

  scrollBottom();

}


/* ================= DELETE CONVERSATION ================= */

function deleteConversation(id) {

  state.conversations =
    state.conversations.filter(
      conversation =>
        conversation.id !== id
    );


  if (
    state.currentConversationId ===
    id
  ) {

    state.currentConversationId =
      null;

    state.messages =
      [];

  }


  save();

  renderHistory();

  renderMessages();

}


/* ================= RENDER MESSAGES ================= */

function renderMessages() {

  if (!chat) return;

  chat.innerHTML = "";


  if (
    welcome &&
    state.messages.length
  ) {

    welcome.style.display =
      "none";

  }


  if (
    welcome &&
    !state.messages.length
  ) {

    welcome.style.display =
      "";

  }


  state.messages.forEach(
    message => {

      if (
        message.role ===
        "system"
      ) {

        return;

      }


      addMessageToUI(
        message.role,
        message.content,
        message
      );

    }
  );


  scrollBottom();

}


/* ================= ADD MESSAGE ================= */

function addMessageToUI(
  role,
  content,
  options = {}
) {

  if (!chat) return null;


  const message =
    document.createElement(
      "div"
    );


  message.className =
    "message " +
    (
      role === "user"
        ? "user"
        : "assistant"
    );


  const inner =
    document.createElement(
      "div"
    );


  inner.className =
    "message-inner";


  const avatar =
    document.createElement(
      "div"
    );


  avatar.className =
    "message-avatar";


  avatar.textContent =
    role === "user"
      ? "أنت"
      : "T";


  const contentBox =
    document.createElement(
      "div"
    );


  contentBox.className =
    "message-content";


  if (
    options.image
  ) {

    const image =
      document.createElement(
        "img"
      );


    image.className =
      "message-image";


    image.src =
      options.image;


    image.alt =
      "الصورة المرفقة";


    contentBox.appendChild(
      image
    );

  }


  if (
    options.fileName
  ) {

    const file =
      document.createElement(
        "div"
      );


    file.className =
      "message-file";


    file.textContent =
      "📎 " +
      options.fileName;


    contentBox.appendChild(
      file
    );

  }


  const text =
    document.createElement(
      "div"
    );


  text.className =
    "message-text";


  text.innerHTML =
    role === "assistant"
      ? formatText(content)
      : esc(content);


  contentBox.appendChild(
    text
  );


  inner.appendChild(
    avatar
  );

  inner.appendChild(
    contentBox
  );


  message.appendChild(
    inner
  );


  chat.appendChild(
    message
  );


  return message;

}


/* ================= ATTACHMENT ================= */

function clearAttachment() {

  state.selectedImage =
    null;

  state.selectedDocument =
    null;


  if (attachmentPreview) {

    attachmentPreview.classList.add(
      "hidden"
    );

  }


  if (attachmentIcon) {

    attachmentIcon.textContent =
      "📎";

  }


  if (attachmentName) {

    attachmentName.textContent =
      "";

  }


  if (attachmentMeta) {

    attachmentMeta.textContent =
      "";

  }


  if (imageInput) {

    imageInput.value =
      "";

  }


  if (documentInput) {

    documentInput.value =
      "";

  }

}


/* ================= SHOW ATTACHMENT ================= */

function showAttachment(
  file,
  type
) {

  if (!attachmentPreview) {
    return;
  }


  attachmentPreview.classList.remove(
    "hidden"
  );


  if (attachmentIcon) {

    attachmentIcon.textContent =
      type === "image"
        ? "🖼️"
        : "📄";

  }


  if (attachmentName) {

    attachmentName.textContent =
      file.name;

  }


  if (attachmentMeta) {

    const size =
      Math.round(
        file.size / 1024
      );

    attachmentMeta.textContent =
      `${size} KB`;

  }

}


/* ================= IMAGE INPUT ================= */

if (imageInput) {

  imageInput.addEventListener(
    "change",
    event => {

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

        toast(
          "الملف المحدد ليس صورة."
        );

        return;

      }


      state.selectedImage =
        file;


      state.imageMode =
        "analyze";


      showAttachment(
        file,
        "image"
      );


      closePlusMenu();

    }
  );

}


/* ================= DOCUMENT INPUT ================= */

if (documentInput) {

  documentInput.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      state.selectedDocument =
        file;


      showAttachment(
        file,
        "document"
      );


      closePlusMenu();

    }
  );

}


/* ================= PLUS BUTTON EVENTS ================= */

if (plusButton) {

  plusButton.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      const isHidden =
        plusMenu.classList.contains(
          "hidden"
        );


      if (isHidden) {

        openPlusMenu();

      } else {

        closePlusMenu();

      }

    }
  );

}


/* ================= PLUS MENU EVENTS ================= */

document.addEventListener(
  "click",
  event => {

    if (
      plusMenu &&
      !plusMenu.contains(
        event.target
      ) &&
      plusButton &&
      !plusButton.contains(
        event.target
      )
    ) {

      closePlusMenu();

    }

  }
);


/* ================= ANALYZE DOCUMENT ================= */

if (analyzeDocumentButton) {

  analyzeDocumentButton.addEventListener(
    "click",
    () => {

      if (!documentInput) {
        return;
      }

      documentInput.click();

    }
  );

}


/* ================= ADD IMAGE ================= */

if (addImageButton) {

  addImageButton.addEventListener(
    "click",
    () => {

      if (!imageInput) {
        return;
      }

      imageInput.click();

    }
  );

}


/* ================= REMOVE ATTACHMENT ================= */

if (attachmentPreview) {

  attachmentPreview.addEventListener(
    "click",
    event => {

      const remove =
        event.target.closest(
          "[data-remove]"
        );


      if (remove) {

        clearAttachment();

      }

    }
  );

}
/* =========================================================
   DOCUMENT EXTRACTION
   ========================================================= */

async function extractDocument(file) {

  const name =
    file.name.toLowerCase();


  /*
   * الملفات النصية
   */

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".js") ||
    name.endsWith(".json") ||
    name.endsWith(".html") ||
    name.endsWith(".css") ||
    name.endsWith(".py") ||
    name.endsWith(".csv")
  ) {

    return await file.text();

  }


  /*
   * PDF
   */

  if (name.endsWith(".pdf")) {

    if (
      !window.pdfjsLib &&
      window.pdfjsReady
    ) {

      await window.pdfjsReady;

    }


    if (!window.pdfjsLib) {

      throw new Error(
        "مكتبة PDF غير متاحة. أعد تحميل الصفحة."
      );

    }


    const buffer =
      await file.arrayBuffer();


    const pdf =
      await window.pdfjsLib
        .getDocument({
          data: buffer
        })
        .promise;


    const pages = [];


    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {

      const page =
        await pdf.getPage(
          pageNumber
        );


      const content =
        await page.getTextContent();


      pages.push(

        content.items
          .map(
            item => item.str
          )
          .join(" ")

      );

    }


    return pages
      .map(
        (text, index) =>
          `--- الصفحة ${index + 1} ---\n${text}`
      )
      .join("\n\n");

  }


  /*
   * DOCX
   */

  if (name.endsWith(".docx")) {

    if (!window.mammoth) {

      throw new Error(
        "مكتبة DOCX غير متاحة. أعد تحميل الصفحة."
      );

    }


    const buffer =
      await file.arrayBuffer();


    const result =
      await window.mammoth
        .extractRawText({
          arrayBuffer:
            buffer
        });


    return result.value;

  }


  throw new Error(
    "نوع الملف غير مدعوم."
  );

}


/* =========================================================
   FILE TO DATA URL
   ========================================================= */

function fileToDataURL(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload =
        () => {

          resolve(
            reader.result
          );

        };


      reader.onerror =
        () => {

          reject(
            new Error(
              "تعذر قراءة الملف."
            )
          );

        };


      reader.readAsDataURL(
        file
      );

    }
  );

}


/* =========================================================
   IMAGE DATA
   ========================================================= */

async function prepareImage(file) {

  if (!file) {
    return null;
  }


  if (
    !file.type.startsWith(
      "image/"
    )
  ) {

    throw new Error(
      "الملف المحدد ليس صورة."
    );

  }


  return await fileToDataURL(
    file
  );

}


/* =========================================================
   DOCUMENT CONTENT
   ========================================================= */

async function prepareDocument(file) {

  if (!file) {
    return null;
  }


  try {

    const content =
      await extractDocument(
        file
      );


    return {

      name:
        file.name,

      type:
        file.type,

      content:
        content

    };

  } catch (error) {

    throw new Error(
      `تعذر قراءة الملف "${file.name}": ${
        error?.message ||
        "خطأ غير معروف"
      }`
    );

  }

}


/* =========================================================
   LIMIT DOCUMENT SIZE
   ========================================================= */

function limitDocumentText(
  text,
  maxLength = 50000
) {

  if (
    typeof text !==
    "string"
  ) {

    return "";

  }


  if (
    text.length <=
    maxLength
  ) {

    return text;

  }


  return (
    text.slice(
      0,
      maxLength
    ) +
    "\n\n[تم اختصار محتوى الملف بسبب كبر حجمه]"
  );

}


/* =========================================================
   BUILD DOCUMENT MESSAGE
   ========================================================= */

function buildDocumentMessage(
  document
) {

  if (!document) {
    return null;
  }


  const content =
    limitDocumentText(
      document.content
    );


  return {

    role:
      "user",

    content:
      `تم إرفاق ملف باسم: ${document.name}

قم بتحليل محتوى الملف والإجابة عن طلب المستخدم اعتمادًا على محتوى الملف.

محتوى الملف:

${content}`

  };

}


/* =========================================================
   BUILD IMAGE MESSAGE
   ========================================================= */

function buildImageMessage(
  text,
  imageData
) {

  const content = [];


  if (text) {

    content.push({

      type:
        "text",

      text:
        text

    });

  }


  if (imageData) {

    content.push({

      type:
        "image_url",

      image_url: {

        url:
          imageData

      }

    });

  }


  return {

    role:
      "user",

    content:
      content

  };

}


/* =========================================================
   REMOVE EMPTY MESSAGES
   ========================================================= */

function cleanMessages(
  messages
) {

  return messages.filter(
    message => {

      if (!message) {
        return false;
      }


      if (
        message.role ===
        "system"
      ) {

        return true;

      }


      if (
        typeof message.content ===
        "string"
      ) {

        return (
          message.content.trim()
            .length > 0
        );

      }


      if (
        Array.isArray(
          message.content
        )
      ) {

        return (
          message.content.length >
          0
        );

      }


      return false;

    }
  );

}


/* =========================================================
   BUILD API MESSAGES
   ========================================================= */

async function buildApiMessages() {

  const messages = [
    {
      role:
        "system",

      content:
        systemMessage.content
    }
  ];


  for (
    const message of state.messages
  ) {

    if (
      message.role !==
        "user" &&
      message.role !==
        "assistant"
    ) {

      continue;

    }


    messages.push({

      role:
        message.role,

      content:
        message.content

    });

  }


  /*
   * صورة جديدة
   */

  if (
    state.selectedImage
  ) {

    const imageData =
      await prepareImage(
        state.selectedImage
      );


    const lastUser =
      messages
        .slice()
        .reverse()
        .find(
          message =>
            message.role ===
            "user"
        );


    const text =
      lastUser?.content ||
      "حلل هذه الصورة وقدم النتيجة للمستخدم.";


    messages.push(
      buildImageMessage(
        text,
        imageData
      )
    );

  }


  /*
   * ملف جديد
   */

  if (
    state.selectedDocument
  ) {

    const document =
      await prepareDocument(
        state.selectedDocument
      );


    const documentMessage =
      buildDocumentMessage(
        document
      );


    if (
      documentMessage
    ) {

      messages.push(
        documentMessage
      );

    }

  }


  return cleanMessages(
    messages
  );

}


/* =========================================================
   PREPARE USER MESSAGE
   ========================================================= */

function getUserText() {

  if (!input) {
    return "";
  }


  return input.value
    .trim();

}


/* =========================================================
   DISABLE SEND
   ========================================================= */

function setSending(
  sending
) {

  state.busy =
    sending;


  if (send) {

    send.disabled =
      sending;

    send.classList.toggle(
      "loading",
      sending
    );

  }


  if (input) {

    input.disabled =
      sending;

  }

}


/* =========================================================
   ASSISTANT TYPING
   ========================================================= */

function createTypingMessage() {

  if (!chat) {
    return null;
  }


  const message =
    document.createElement(
      "div"
    );


  message.className =
    "message assistant typing-message";


  const inner =
    document.createElement(
      "div"
    );


  inner.className =
    "message-inner";


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


  const typing =
    document.createElement(
      "div"
    );


  typing.className =
    "typing";


  typing.innerHTML =
    "<span></span><span></span><span></span>";


  content.appendChild(
    typing
  );


  inner.appendChild(
    avatar
  );

  inner.appendChild(
    content
  );


  message.appendChild(
    inner
  );


  chat.appendChild(
    message
  );


  scrollBottom();


  return message;

}


/* =========================================================
   REMOVE TYPING
   ========================================================= */

function removeTypingMessage(
  element
) {

  if (
    element &&
    element.parentNode
  ) {

    element.parentNode.removeChild(
      element
    );

  }

}
