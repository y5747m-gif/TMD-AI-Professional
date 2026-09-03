const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  conversations: JSON.parse(localStorage.getItem("tmd_conversations") || "[]"),
  theme: localStorage.getItem("tmd_theme") || "dark",
  model: localStorage.getItem("tmd_model") || "llama-3.3-70b-versatile",
  busy: false,
  controller: null,

  // Image state
  selectedImage: null,
  imageMode: null
};

const $ = s => document.querySelector(s);

const chat = $("#chat");
const welcome = $("#welcome");
const input = $("#input");
const send = $("#send");
const historyList = $("#history");
const sidebar = $("#sidebar");

const plusButton = $("#plusButton");
const plusMenu = $("#plusMenu");
const addImageButton = $("#addImageButton");
const imageEditButton = $("#imageEditButton");
const imageInput = $("#imageInput");

const imagePreviewContainer = $("#imagePreviewContainer");
const imagePreview = $("#imagePreview");
const imageFileName = $("#imageFileName");
const imageModeLabel = $("#imageModeLabel");
const removeImage = $("#removeImage");


/* ========================================
   SAVE
======================================== */

function save() {
  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(state.messages)
  );

  localStorage.setItem(
    "tmd_conversations",
    JSON.stringify(state.conversations)
  );
}


/* ========================================
   TOAST
======================================== */

function toast(t) {
  const x = $("#toast");

  if (!x) return;

  x.textContent = t;
  x.classList.add("show");

  clearTimeout(toast.t);

  toast.t = setTimeout(() => {
    x.classList.remove("show");
  }, 2000);
}


/* ========================================
   ESCAPE HTML
======================================== */

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}


/* ========================================
   FORMAT TEXT
======================================== */

function formatText(t) {

  let e = esc(t);

  // أكواد البرمجة
  e = e.replace(
    /```([\w+-]*)\n?([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code>${code.trim()}</code></pre>`
  );

  // أكواد داخل السطر
  e = e.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  // الأسطر الجديدة
  return e.replace(/\n/g, "<br>");
}


/* ========================================
   RENDER MESSAGES
======================================== */

function renderMessages() {

  chat.innerHTML = "";

  if (!state.messages.length) {

    chat.appendChild(welcome);

    welcome.style.display = "flex";

    return;
  }

  welcome.style.display = "none";

  state.messages.forEach(m => {

    const div = document.createElement("div");

    div.className = `msg ${m.role}`;

    div.innerHTML = `
      <div class="msg-avatar">
        ${m.role === "user" ? "U" : "T"}
      </div>

      <div class="msg-content">
        ${formatText(m.content)}
      </div>
    `;

    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
}


/* ========================================
   IMAGE MENU
======================================== */

function togglePlusMenu() {

  if (!plusMenu) return;

  const isHidden =
    plusMenu.classList.contains("hidden");

  if (isHidden) {

    plusMenu.classList.remove("hidden");

    plusButton.classList.add("active");

    plusButton.setAttribute(
      "aria-expanded",
      "true"
    );

  } else {

    closePlusMenu();
  }
}


function closePlusMenu() {

  if (!plusMenu) return;

  plusMenu.classList.add("hidden");

  plusButton.classList.remove("active");

  plusButton.setAttribute(
    "aria-expanded",
    "false"
  );
}


/* ========================================
   OPEN IMAGE PICKER
======================================== */

function openImagePicker(mode) {

  state.imageMode = mode;

  closePlusMenu();

  if (!imageInput) return;

  imageInput.value = "";

  imageInput.click();
}


/* ========================================
   HANDLE IMAGE
======================================== */

function handleImage(file) {

  if (!file) return;

  if (!file.type.startsWith("image/")) {

    toast("يرجى اختيار ملف صورة.");

    return;
  }


  /*
   * Limit image size to 20MB.
   * This is only a frontend safety check.
   */

  const maxSize = 20 * 1024 * 1024;

  if (file.size > maxSize) {

    toast("حجم الصورة كبير جدًا. الحد الأقصى 20MB.");

    return;
  }


  state.selectedImage = file;


  const reader = new FileReader();


  reader.onload = event => {

    if (imagePreview) {

      imagePreview.src =
        event.target.result;
    }


    if (imageFileName) {

      imageFileName.textContent =
        file.name;
    }


    if (imageModeLabel) {

      if (state.imageMode === "edit") {

        imageModeLabel.textContent =
          "تعديل الصورة بالذكاء الاصطناعي";

      } else {

        imageModeLabel.textContent =
          "إضافة صورة";
      }
    }


    if (imagePreviewContainer) {

      imagePreviewContainer.classList.remove(
        "hidden"
      );
    }
  };


  reader.readAsDataURL(file);
}


/* ========================================
   REMOVE IMAGE
======================================== */

function clearSelectedImage() {

  state.selectedImage = null;
  state.imageMode = null;

  if (imageInput) {
    imageInput.value = "";
  }

  if (imagePreview) {
    imagePreview.src = "";
  }

  if (imagePreviewContainer) {

    imagePreviewContainer.classList.add(
      "hidden"
    );
  }

  if (imageFileName) {
    imageFileName.textContent = "";
  }

  if (imageModeLabel) {
    imageModeLabel.textContent = "";
  }
}


/* ========================================
   SEND MESSAGE
======================================== */

async function sendMessage() {

  const text = input.value.trim();


  /*
   * Allow image selection even when
   * there is no text.
   */

  if (
    !text &&
    !state.selectedImage
  ) {
    return;
  }


  if (state.busy) return;


  /*
   * Current backend/Groq connection
   * remains unchanged.
   */

  let messageText = text;


  /*
   * If an image is selected, add a local
   * description to the user message.
   *
   * We do NOT send the image to Groq here
   * because the existing /api/chat endpoint
   * currently accepts the existing messages
   * structure only.
   */

  if (state.selectedImage) {

    const imageName =
      state.selectedImage.name ||
      "الصورة";


    if (state.imageMode === "edit") {

      messageText =
        text
          ? `${text}\n\n[الصورة المرفقة: ${imageName}]\n[وضع الطلب: تعديل الصورة بالذكاء الاصطناعي]`
          : `[الصورة المرفقة: ${imageName}]\n[وضع الطلب: تعديل الصورة بالذكاء الاصطناعي]`;

    } else {

      messageText =
        text
          ? `${text}\n\n[الصورة المرفقة: ${imageName}]`
          : `[الصورة المرفقة: ${imageName}]`;
    }
  }


  state.messages.push({
    role: "user",
    content: messageText
  });


  input.value = "";

  input.style.height = "auto";


  /*
   * Clear image UI after creating the message.
   */

  clearSelectedImage();


  renderMessages();


  state.busy = true;

  send.disabled = true;


  try {

    /*
     * GROQ CONNECTION
     * DO NOT CHANGE
     */

    const res = await fetch("/api/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: state.messages,
        model: state.model
      })

    });


    const data = await res.json();


    if (res.ok && data.ok) {

      state.messages.push({
        role: "assistant",
        content: data.reply
      });

    } else {

      toast(
        data.error ||
        "حدث خطأ أثناء الاتصال."
      );
    }


  } catch (err) {

    console.error(err);

    toast(
      "خطأ في الاتصال بالشبكة."
    );


  } finally {

    state.busy = false;

    send.disabled = false;

    save();

    renderMessages();
  }
}


/* ========================================
   SEND BUTTON
======================================== */

send.onclick = sendMessage;


/* ========================================
   TEXTAREA
======================================== */

input.onkeydown = e => {

  if (
    e.key === "Enter" &&
    !e.shiftKey
  ) {

    e.preventDefault();

    sendMessage();
  }
};


/*
 * Auto resize textarea
 */

input.addEventListener(
  "input",
  () => {

    input.style.height = "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        150
      ) + "px";
  }
);


/* ========================================
   PLUS BUTTON EVENTS
======================================== */

if (plusButton) {

  plusButton.onclick = e => {

    e.stopPropagation();

    togglePlusMenu();
  };
}


/* ========================================
   ADD IMAGE
======================================== */

if (addImageButton) {

  addImageButton.onclick = () => {

    openImagePicker("upload");
  };
}


/* ========================================
   AI IMAGE EDIT
======================================== */

if (imageEditButton) {

  imageEditButton.onclick = () => {

    openImagePicker("edit");
  };
}


/* ========================================
   FILE INPUT
======================================== */

if (imageInput) {

  imageInput.onchange = e => {

    const file =
      e.target.files &&
      e.target.files[0];

    handleImage(file);
  };
}


/* ========================================
   REMOVE IMAGE
======================================== */

if (removeImage) {

  removeImage.onclick =
    clearSelectedImage;
}


/* ========================================
   CLOSE PLUS MENU
======================================== */

document.addEventListener(
  "click",
  e => {

    if (
      plusMenu &&
      !plusMenu.contains(e.target) &&
      plusButton &&
      !plusButton.contains(e.target)
    ) {

      closePlusMenu();
    }
  }
);


/* ========================================
   NEW CHAT
======================================== */

$("#newChat").onclick = () => {

  if (state.messages.length > 0) {

    state.conversations.unshift({

      id: Date.now(),

      title:
        state.messages[0]
          .content
          .slice(0, 25),

      messages:
        [...state.messages]

    });

    state.messages = [];

    save();

    renderMessages();

    toast(
      "تم بدء محادثة جديدة"
    );
  }
};


/* ========================================
   THEME
======================================== */

function applyTheme(v) {

  document.body.classList.toggle(
    "light",
    v === "light"
  );

  state.theme = v;

  localStorage.setItem(
    "tmd_theme",
    v
  );


  /*
   * Keep settings select synchronized.
   */

  const themeSelect =
    $("#themeSelect");

  if (themeSelect) {

    themeSelect.value = v;
  }
}


$("#themeTop").onclick = () => {

  applyTheme(
    state.theme === "dark"
      ? "light"
      : "dark"
  );
};


/* ========================================
   THEME SELECT
======================================== */

const themeSelect =
  $("#themeSelect");

if (themeSelect) {

  themeSelect.value =
    state.theme;

  themeSelect.onchange = e => {

    applyTheme(
      e.target.value
    );
  };
}


/* ========================================
   MODEL SELECT
======================================== */

/*
 * This only keeps the existing UI
 * synchronized with state.model.
 *
 * No model has been changed.
 */

const modelSelect =
  $("#modelSelect");

if (modelSelect) {

  modelSelect.value =
    state.model;

  modelSelect.onchange = e => {

    state.model =
      e.target.value;

    localStorage.setItem(
      "tmd_model",
      state.model
    );


    const modelName =
      $("#modelName");

    if (modelName) {

      if (
        state.model ===
        "llama-3.3-70b-versatile"
      ) {

        modelName.textContent =
          "T.M.D Fast (Llama 3.3)";

      } else {

        modelName.textContent =
          e.target.options[
            e.target.selectedIndex
          ].text;
      }
    }

    toast("تم تغيير النموذج");
  };
}


/* ========================================
   SIDEBAR
======================================== */

$("#openSidebar").onclick = () => {

  sidebar.classList.add(
    "open"
  );
};


$("#closeSidebar").onclick = () => {

  sidebar.classList.remove(
    "open"
  );
};


/* ========================================
   SETTINGS MODAL
======================================== */

$("#settingsBtn").onclick = () => {

  $("#modalBackdrop")
    .classList
    .remove("hidden");
};


$("#modalClose").onclick = () => {

  $("#modalBackdrop")
    .classList
    .add("hidden");
};


/* Close modal when clicking backdrop */

$("#modalBackdrop").onclick = e => {

  if (
    e.target ===
    $("#modalBackdrop")
  ) {

    $("#modalBackdrop")
      .classList
      .add("hidden");
  }
};


/* ========================================
   INITIALIZE
======================================== */

applyTheme(state.theme);

if (modelSelect) {

  modelSelect.value =
    state.model;
}

renderMessages();
