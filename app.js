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



/* ================= ATTACHMENT ================= */

function resetAttachment() {

  state.selectedImage =
    null;

  state.selectedDocument =
    null;


  attachmentPreview.classList.add(
    "hidden"
  );


  imageInput.value =
    "";

  documentInput.value =
    "";

}



function showAttachment(
  file,
  kind
) {

  attachmentPreview.classList.remove(
    "hidden"
  );


  attachmentIcon.textContent =
    kind === "image"
      ? "🖼️"
      : "📄";


  attachmentName.textContent =
    file.name;


  attachmentMeta.textContent =
    `${
      kind === "image"
        ? "صورة"
        : "ملف للتحليل"
    } · ${formatBytes(file.size)}`;

}



function formatBytes(bytes) {

  if (bytes < 1024) {

    return `${bytes} B`;

  }


  if (bytes < 1024 ** 2) {

    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;

  }


  return `${(
    bytes / (1024 ** 2)
  ).toFixed(1)} MB`;

}



/* ================= MESSAGE ================= */

function addMessage(
  role,
  content,
  meta = ""
) {

  if (welcome) {

    welcome.style.display =
      "none";

  }


  const wrap =
    document.createElement(
      "article"
    );


  wrap.className =
    `message ${role}`;


  wrap.innerHTML = `

    <div class="msg-avatar">

      ${
        role === "user"
          ? "أنت"
          : "T"
      }

    </div>


    <div class="msg-body">

      <div class="msg-label">

        ${
          role === "user"
            ? "أنت"
            : "T.M.D AI"
        }

        ${
          meta
            ? `<span>${esc(meta)}</span>`
            : ""
        }

      </div>


      <div class="msg-content">

        ${formatText(content)}

      </div>

    </div>

  `;


  chat.appendChild(
    wrap
  );


  scrollBottom();


  return wrap;

}



/* ================= HISTORY ================= */

function renderHistory() {

  historyList.innerHTML =
    "";


  const list =
    [
      ...state.conversations
    ].reverse();


  if (!list.length) {

    historyList.innerHTML =
      `
      <div class="empty-history">
        لا توجد محادثات محفوظة
      </div>
      `;

    return;

  }


  list.forEach(
    conversation => {

      const button =
        document.createElement(
          "button"
        );


      button.className =
        "history-item";

      button.type =
        "button";


      button.textContent =
        conversation.title ||
        "محادثة جديدة";


      button.addEventListener(
        "click",
        () =>
          loadConversation(
            conversation
          )
      );


      historyList.appendChild(
        button
      );

    }
  );

}



/* ================= LOAD CONVERSATION ================= */

function loadConversation(
  conversation
) {

  chat
    .querySelectorAll(
      ".message"
    )
    .forEach(
      element =>
        element.remove()
    );


  if (welcome) {

    welcome.style.display =
      "none";

  }


  (
    conversation.messages ||
    []
  ).forEach(
    message =>
      addMessage(
        message.role,
        message.content
      )
  );


  sidebar.classList.remove(
    "open"
  );

}



/* ================= SAVE CONVERSATION ================= */

function persistConversation() {

  if (
    !state.messages.length
  ) {

    return;

  }


  const title =
    String(
      state.messages.find(
        message =>
          message.role === "user"
      )?.content ||
      "محادثة جديدة"
    ).slice(
      0,
      55
    );


  state.conversations.push({

    id:
      Date.now(),

    title,

    messages:
      state.messages.slice(
        -50
      )

  });


  state.messages =
    [];


  save();

  renderHistory();

}



/* ================= FILE READER ================= */

async function readFileAsText(
  file
) {

  const name =
    file.name.toLowerCase();


  /* TEXT FILES */

  if (
    /\.(txt|md|js|json|html|css|py|csv)$/i.test(
      name
    )
  ) {

    return await file.text();

  }



  /* WORD */

  if (
    name.endsWith(".docx")
  ) {

    if (!window.mammoth) {

      throw new Error(
        "تعذر تحميل قارئ Word. أعد تحميل الصفحة."
      );

    }


    const result =
      await mammoth.extractRawText({

        arrayBuffer:
          await file.arrayBuffer()

      });


    return result.value;

  }



  /* EXCEL */

  if (
    /\.xlsx?$/i.test(name)
  ) {

    if (!window.XLSX) {

      throw new Error(
        "تعذر تحميل قارئ Excel. أعد تحميل الصفحة."
      );

    }


    const workbook =
      XLSX.read(
        await file.arrayBuffer(),
        {
          type: "array"
        }
      );


    return workbook
      .SheetNames
      .map(
        sheetName =>

          `### Sheet: ${sheetName}\n` +

          XLSX.utils.sheet_to_csv(
            workbook.Sheets[
              sheetName
            ]
          )

      )
      .join("\n\n");

  }



  /* PDF */

  if (
    name.endsWith(".pdf")
  ) {

    return await readPdf(
      file
    );

  }


  throw new Error(
    "صيغة الملف غير مدعومة."
  );

}



/* ================= PDF ================= */

async function readPdf(
  file
) {

  if (!window.pdfjsLib) {

    const module =
      await import(
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs"
      );


    window.pdfjsLib =
      module;

  }


  const pdf =
    await window.pdfjsLib
      .getDocument({

        data:
          new Uint8Array(
            await file.arrayBuffer()
          )

      })
      .promise;


  const pages =
    [];


  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    const page =
      await pdf.getPage(
        pageNumber
      );


    const textContent =
      await page.getTextContent();


    pages.push(

      `### الصفحة ${pageNumber}\n` +

      textContent.items
        .map(
          item =>
            item.str
        )
        .join(" ")

    );

  }


  return pages.join(
    "\n\n"
  );

}



/* ================= IMAGE DATA ================= */

async function fileToDataUrl(
  file
) {

  return await new Promise(
    (
      resolve,
      reject
    ) => {

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
              "تعذر قراءة الصورة."
            )
          );


      reader.readAsDataURL(
        file
      );

    }
  );

}



/* ================= DOCUMENT PROMPT ================= */

function buildDocumentPrompt(
  userText,
  fileName,
  text
) {

  const limit =
    45000;


  const clipped =
    text.length > limit

      ? text.slice(
          0,
          limit
        ) +
        "\n\n[تم اختصار باقي الملف بسبب الحجم]"

      : text;


  return `

لديك ملف مرفق اسمه:

${fileName}


محتوى الملف:

---

${clipped}

---


طلب المستخدم:

${
  userText ||
  "حلل الملف واذكر أهم محتوياته ونقاطه المهمة."
}


تعامل مع المحتوى الموجود فقط.

إذا كانت معلومة غير موجودة في الملف
فاذكر ذلك بوضوح.

`;

}



/* ================= GROQ CHAT ================= */

async function sendText(
  messages
) {

  const controller =
    new AbortController();


  state.controller =
    controller;


  /*
   * لا نغيّر اتصال Groq.
   * نفس endpoint الموجود في المشروع.
   */

  const response =
    await fetch(
      "/api/chat",
      {

        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            messages
          }),

        signal:
          controller.signal

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
      "تعذر الاتصال بـ Groq."
    );

  }


  return (
    data.reply ||
    data.message ||
    "لم تصل نتيجة من النموذج."
  );

}



/* ================= GROQ IMAGE ================= */

async function analyzeImage(
  dataUrl,
  prompt
) {

  /*
   * نفس API الخاص بالصور.
   */

  const response =
    await fetch(
      "/api/image",
      {

        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            image:
              dataUrl,

            prompt:
              prompt ||
              "حلل الصورة بالتفصيل واقرأ النصوص الواضحة فيها."

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
      "تعذر تحليل الصورة."
    );

  }


  return (
    data.message ||
    data.reply ||
    "لم تصل نتيجة تحليل الصورة."
  );

}



/* ================= SEND ================= */

async function handleSend() {

  if (state.busy) {

    state.controller?.abort();

    return;

  }


  const raw =
    input.value.trim();


  if (
    !raw &&
    !state.selectedImage &&
    !state.selectedDocument
  ) {

    return;

  }


  state.busy =
    true;


  send.classList.add(
    "stop"
  );


  send.textContent =
    "■";


  const userText =
    raw ||

    (
      state.selectedImage
        ? "حلل هذه الصورة."
        : "حلل هذا الملف."
    );


  addMessage(

    "user",

    userText,

    state.selectedDocument?.name ||
    state.selectedImage?.name ||
    ""

  );


  input.value =
    "";


  autoResize();


  const typing =
    addMessage(
      "assistant",
      "جاري التحليل…"
    );


  try {

    let reply;



    /* ================= DOCUMENT ================= */

    if (
      state.selectedDocument
    ) {

      const file =
        state.selectedDocument;


      if (
        file.size >
        15 * 1024 * 1024
      ) {

        throw new Error(
          "حجم الملف كبير. الحد المقترح للتحليل 15MB."
        );

      }


      const text =
        await readFileAsText(
          file
        );


      if (
        !text.trim()
      ) {

        throw new Error(
          "لم أستطع استخراج نص من الملف. قد يكون PDF عبارة عن صور ممسوحة."
        );

      }


      const prompt =
        buildDocumentPrompt(
          userText,
          file.name,
          text
        );


      const messages =
        [
          ...state.messages,

          {
            role:
              "user",

            content:
              prompt
          }

        ];


      reply =
        await sendText(
          messages
        );


      state.messages.push(

        {
          role:
            "user",

          content:
            userText
        },

        {
          role:
            "assistant",

          content:
            reply
        }

      );



    /* ================= IMAGE ================= */

    } else if (
      state.selectedImage
    ) {

      const dataUrl =
        await fileToDataUrl(
          state.selectedImage
        );


      reply =
        await analyzeImage(
          dataUrl,
          userText
        );


      state.messages.push(

        {
          role:
            "user",

          content:
            userText
        },

        {
          role:
            "assistant",

          content:
            reply
        }

      );



    /* ================= NORMAL CHAT ================= */

    } else {

      state.messages.push({

        role:
          "user",

        content:
          userText

      });


      reply =
        await sendText(
          state.messages
        );


      state.messages.push({

        role:
          "assistant",

        content:
          reply

      });

    }



    typing
      .querySelector(
        ".msg-content"
      )
      .innerHTML =
        formatText(
          reply
        );


    save();


  } catch (error) {

    if (
      error.name !==
      "AbortError"
    ) {

      typing
        .querySelector(
          ".msg-content"
        )
        .innerHTML =

        `
        <span class="error-text">
          ${esc(
            error.message ||
            "حدث خطأ غير متوقع."
          )}
        </span>
        `;


      toast(
        error.message ||
        "حدث خطأ"
      );

    }

  } finally {

    resetAttachment();

    state.busy =
      false;

    state.controller =
      null;


    send.classList.remove(
      "stop"
    );


    send.textContent =
      "↑";


    scrollBottom();

  }

}



/* ================= RESIZE ================= */

function autoResize() {

  input.style.height =
    "auto";


  input.style.height =
    Math.min(
      input.scrollHeight,
      180
    ) +
    "px";

}



/* ================= PLUS ================= */

plusButton.addEventListener(
  "click",
  event => {

    event.stopPropagation();


    if (
      plusMenu.classList.contains(
        "hidden"
      )
    ) {

      openPlusMenu();

    } else {

      closePlusMenu();

    }

  }
);



document.addEventListener(
  "click",
  event => {

    if (
      !event.target.closest(
        ".plus-menu-wrapper"
      )
    ) {

      closePlusMenu();

    }

  }
);



/* ================= DOCUMENT ================= */

analyzeDocumentButton.addEventListener(
  "click",
  () => {

    closePlusMenu();

    documentInput.click();

  }
);



documentInput.addEventListener(
  "change",
  () => {

    const file =
      documentInput.files?.[0];


    if (!file) return;


    state.selectedDocument =
      file;


    state.selectedImage =
      null;


    showAttachment(
      file,
      "document"
    );


    toast(
      "تم إرفاق الملف. اكتب طلبك ثم اضغط إرسال."
    );

  }
);



/* ================= IMAGE ================= */

addImageButton.addEventListener(
  "click",
  () => {

    state.imageMode =
      "analyze";


    closePlusMenu();

    imageInput.click();

  }
);



imageEditButton.addEventListener(
  "click",
  () => {

    state.imageMode =
      "edit";


    closePlusMenu();

    imageInput.click();

  }
);



imageInput.addEventListener(
  "change",
  () => {

    const file =
      imageInput.files?.[0];


    if (!file) return;


    if (
      file.size >
      20 * 1024 * 1024
    ) {

      toast(
        "الصورة أكبر من 20MB."
      );

      return;

    }


    state.selectedImage =
      file;


    state.selectedDocument =
      null;


    showAttachment(
      file,
      "image"
    );


    toast(
      "تم إرفاق الصورة."
    );

  }
);



/* ================= REMOVE ================= */

$("#removeAttachment")
  .addEventListener(
    "click",
    resetAttachment
  );



/* ================= SEND ================= */

send.addEventListener(
  "click",
  handleSend
);



input.addEventListener(
  "input",
  autoResize
);



input.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      handleSend();

    }

  }
);



/* ================= NEW CHAT ================= */

$("#newChat")
  .addEventListener(
    "click",
    () => {

      if (
        state.messages.length
      ) {

        persistConversation();

      }


      chat
        .querySelectorAll(
          ".message"
        )
        .forEach(
          element =>
            element.remove()
        );


      welcome.style.display =
        "flex";


      resetAttachment();

      input.focus();

    }
  );



/* ================= SIDEBAR ================= */

$("#openSidebar")
  .addEventListener(
    "click",
    () =>
      sidebar.classList.add(
        "open"
      )
  );



$("#closeSidebar")
  .addEventListener(
    "click",
    () =>
      sidebar.classList.remove(
        "open"
      )
  );



/* ================= SETTINGS ================= */

$("#settingsBtn")
  .addEventListener(
    "click",
    () =>
      $("#modalBackdrop")
        .classList.remove(
          "hidden"
        )
  );



$("#modalClose")
  .addEventListener(
    "click",
    () =>
      $("#modalBackdrop")
        .classList.add(
          "hidden"
        )
  );



$("#modalBackdrop")
  .addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "modalBackdrop"
      ) {

        event.currentTarget
          .classList.add(
            "hidden"
          );

      }

    }
  );



/* ================= THEME ================= */

$("#themeTop")
  .addEventListener(
    "click",
    () =>

      setTheme(
        state.theme === "dark"
          ? "light"
          : "dark"
      )

  );



$("#themeSelect")
  .addEventListener(
    "change",
    event =>
      setTheme(
        event.target.value
      )
  );



/* ================= MODEL ================= */

$("#modelSelect")
  .addEventListener(
    "change",
    event => {

      state.model =
        event.target.value;


      save();


      toast(
        "تم حفظ النموذج."
      );

    }
  );



/* ================= QUICK ACTIONS ================= */

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
            button.dataset.prompt;


          autoResize();

          input.focus();

        }
      );

    }
  );



/* ================= INIT ================= */

setTheme(
  state.theme
);


$("#modelSelect").value =
  state.model;


renderHistory();

autoResize();
