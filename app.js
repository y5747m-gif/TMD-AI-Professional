const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  conversations: JSON.parse(
    localStorage.getItem("tmd_conversations") || "[]"
  ),

  theme: localStorage.getItem("tmd_theme") || "dark",

  model:
    localStorage.getItem("tmd_model") ||
    "llama-3.3-70b-versatile",

  busy: false,
  controller: null,

  // =========================
  // Image State
  // =========================
  selectedImage: null,
  imageMode: "analyze"
};


// =====================================================
// DOM
// =====================================================

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


// =====================================================
// SAVE
// =====================================================

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


// =====================================================
// TOAST
// =====================================================

function toast(message) {
  const element = $("#toast");

  if (!element) return;

  element.textContent = message;

  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 2500);
}


// =====================================================
// ESCAPE HTML
// =====================================================

function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}


// =====================================================
// FORMAT TEXT
// =====================================================

function formatText(text) {
  let result = esc(text);

  // Code blocks
  result = result.replace(
    /```([\w+-]*)\n?([\s\S]*?)```/g,
    (_, language, code) => {
      return `
        <pre>
          <code>${code.trim()}</code>
        </pre>
      `;
    }
  );

  // Inline code
  result = result.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  // New lines
  return result.replace(/\n/g, "<br>");
}


// =====================================================
// RENDER MESSAGES
// =====================================================

function renderMessages() {
  if (!chat) return;

  chat.innerHTML = "";

  if (!state.messages.length) {
    if (welcome) {
      chat.appendChild(welcome);
      welcome.style.display = "flex";
    }

    return;
  }

  if (welcome) {
    welcome.style.display = "none";
  }

  state.messages.forEach(message => {
    const div = document.createElement("div");

    div.className = `msg ${message.role}`;

    const avatar =
      message.role === "user"
        ? "أنت"
        : "T";

    div.innerHTML = `
      <div class="msg-avatar">
        ${avatar}
      </div>

      <div class="msg-content">
        ${formatText(message.content)}
      </div>
    `;

    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
}


// =====================================================
// PLUS MENU
// =====================================================

function togglePlusMenu() {
  if (!plusMenu || !plusButton) return;

  const hidden =
    plusMenu.classList.contains("hidden");

  if (hidden) {
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
  if (!plusMenu || !plusButton) return;

  plusMenu.classList.add("hidden");

  plusButton.classList.remove("active");

  plusButton.setAttribute(
    "aria-expanded",
    "false"
  );
}


// =====================================================
// OPEN IMAGE PICKER
// =====================================================

function openImagePicker(mode = "analyze") {
  state.imageMode = "analyze";

  closePlusMenu();

  if (!imageInput) return;

  imageInput.value = "";

  imageInput.click();
}


// =====================================================
// IMAGE PREVIEW
// =====================================================

function showImagePreview(file, dataUrl) {
  if (imagePreview) {
    imagePreview.src = dataUrl;
  }

  if (imageFileName) {
    imageFileName.textContent = file.name;
  }

  if (imageModeLabel) {
    imageModeLabel.textContent =
      "تحليل الصورة بالذكاء الاصطناعي";
  }

  if (imagePreviewContainer) {
    imagePreviewContainer.classList.remove(
      "hidden"
    );
  }
}


// =====================================================
// HANDLE IMAGE
// =====================================================

function handleImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    toast("يرجى اختيار ملف صورة صحيح.");
    return;
  }

  /*
   * Frontend limit.
   * The backend also checks the size.
   */

  const maxSize =
    6 * 1024 * 1024;

  if (file.size > maxSize) {
    toast(
      "حجم الصورة كبير جدًا. استخدم صورة أقل من 6MB."
    );

    return;
  }

  state.selectedImage = file;
  state.imageMode = "analyze";

  const reader = new FileReader();

  reader.onload = event => {
    showImagePreview(
      file,
      event.target.result
    );
  };

  reader.onerror = () => {
    toast("تعذر قراءة الصورة.");
  };

  reader.readAsDataURL(file);
}


// =====================================================
// CLEAR IMAGE
// =====================================================

function clearSelectedImage() {
  state.selectedImage = null;
  state.imageMode = "analyze";

  if (imageInput) {
    imageInput.value = "";
  }

  if (imagePreview) {
    imagePreview.src = "";
  }

  if (imageFileName) {
    imageFileName.textContent = "";
  }

  if (imageModeLabel) {
    imageModeLabel.textContent = "";
  }

  if (imagePreviewContainer) {
    imagePreviewContainer.classList.add(
      "hidden"
    );
  }
}


// =====================================================
// FILE -> DATA URL
// =====================================================

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(
        new Error("تعذر قراءة الصورة.")
      );
    };

    reader.readAsDataURL(file);
  });
}


// =====================================================
// ANALYZE IMAGE WITH GROQ
// =====================================================

async function analyzeImage(
  imageData,
  prompt
) {

  const response = await fetch(
    "/api/image",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        image: imageData,

        prompt:
          prompt ||
          "حلل هذه الصورة بالتفصيل. صف ما يظهر فيها، واقرأ أي نص واضح داخلها، واذكر التفاصيل المهمة فقط دون اختلاق معلومات.",

        mode: "analyze"
      })
    }
  );

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error ||
      "تعذر تحليل الصورة."
    );
  }

  return (
    data.message ||
    data.reply ||
    ""
  );
}


// =====================================================
// NORMAL CHAT WITH GROQ
// =====================================================

async function sendNormalMessage() {

  const response = await fetch(
    "/api/chat",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      /*
       * GROQ CHAT CONNECTION
       * REMAINS UNCHANGED
       */

      body: JSON.stringify({
        messages: state.messages,
        model: state.model
      })
    }
  );

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error ||
      "حدث خطأ أثناء الاتصال."
    );
  }

  return data.reply;
}


// =====================================================
// SEND MESSAGE
// =====================================================

async function sendMessage() {

  const text =
    input.value.trim();

  /*
   * Allow:
   * 1. Text only
   * 2. Image only
   * 3. Text + image
   */

  if (
    !text &&
    !state.selectedImage
  ) {
    return;
  }

  if (state.busy) return;


  // ===================================================
  // IMAGE MESSAGE
  // ===================================================

  if (state.selectedImage) {

    state.busy = true;

    send.disabled = true;

    const imageFile =
      state.selectedImage;

    const imageName =
      imageFile.name ||
      "الصورة";


    try {

      /*
       * Read image
       */

      const imageData =
        await fileToDataURL(
          imageFile
        );


      /*
       * Show user's message
       */

      const userText =
        text ||
        "حلل هذه الصورة.";

      state.messages.push({
        role: "user",
        content:
          `${userText}\n\n` +
          `🖼️ الصورة المرفقة: ${imageName}`
      });


      input.value = "";

      input.style.height = "auto";

      clearSelectedImage();

      renderMessages();


      /*
       * Analyze image using:
       *
       * /api/image
       *
       * which connects to Groq.
       *
       * No image generation.
       */

      const result =
        await analyzeImage(
          imageData,
          userText
        );


      /*
       * Add AI response
       */

      state.messages.push({
        role: "assistant",
        content: result
      });


    } catch (error) {

      console.error(
        "Image analysis error:",
        error
      );

      toast(
        error.message ||
        "تعذر تحليل الصورة."
      );

    } finally {

      state.busy = false;

      send.disabled = false;

      save();

      renderMessages();
    }

    return;
  }


  // ===================================================
  // NORMAL TEXT MESSAGE
  // ===================================================

  state.messages.push({
    role: "user",
    content: text
  });

  input.value = "";

  input.style.height = "auto";

  renderMessages();

  state.busy = true;

  send.disabled = true;


  try {

    /*
     * Existing Groq connection.
     * DO NOT CHANGE.
     */

    const reply =
      await sendNormalMessage();

    state.messages.push({
      role: "assistant",
      content: reply
    });

  } catch (error) {

    console.error(error);

    toast(
      error.message ||
      "خطأ في الاتصال بالشبكة."
    );

  } finally {

    state.busy = false;

    send.disabled = false;

    save();

    renderMessages();
  }
}


// =====================================================
// SEND BUTTON
// =====================================================

if (send) {
  send.onclick =
    sendMessage;
}


// =====================================================
// TEXTAREA
// =====================================================

if (input) {

  input.onkeydown = e => {

    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {

      e.preventDefault();

      sendMessage();
    }
  };


  input.addEventListener(
    "input",
    () => {

      input.style.height =
        "auto";

      input.style.height =
        Math.min(
          input.scrollHeight,
          150
        ) + "px";
    }
  );
}


// =====================================================
// PLUS BUTTON
// =====================================================

if (plusButton) {

  plusButton.onclick = e => {

    e.stopPropagation();

    togglePlusMenu();
  };
}


// =====================================================
// ADD IMAGE
// =====================================================

if (addImageButton) {

  addImageButton.onclick = () => {

    /*
     * Image analysis only.
     */

    openImagePicker(
      "analyze"
    );
  };
}


// =====================================================
// AI IMAGE EDIT BUTTON
// =====================================================

if (imageEditButton) {

  imageEditButton.onclick = () => {

    /*
     * IMPORTANT:
     *
     * This project does NOT generate
     * or create images.
     *
     * We keep the button compatible,
     * but the selected image is sent
     * for AI analysis only.
     */

    openImagePicker(
      "analyze"
    );
  };
}


// =====================================================
// FILE INPUT
// =====================================================

if (imageInput) {

  imageInput.onchange =
    event => {

      const file =
        event.target.files &&
        event.target.files[0];

      handleImage(file);
    };
}


// =====================================================
// REMOVE IMAGE
// =====================================================

if (removeImage) {

  removeImage.onclick =
    clearSelectedImage;
}


// =====================================================
// CLOSE PLUS MENU
// =====================================================

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


// =====================================================
// NEW CHAT
// =====================================================

const newChat =
  $("#newChat");

if (newChat) {

  newChat.onclick = () => {

    if (
      state.messages.length > 0
    ) {

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

      clearSelectedImage();

      save();

      renderMessages();

      toast(
        "تم بدء محادثة جديدة"
      );
    }
  };
}


// =====================================================
// THEME
// =====================================================

function applyTheme(value) {

  document.body.classList.toggle(
    "light",
    value === "light"
  );

  state.theme = value;

  localStorage.setItem(
    "tmd_theme",
    value
  );

  const themeSelect =
    $("#themeSelect");

  if (themeSelect) {
    themeSelect.value =
      value;
  }
}


const themeTop =
  $("#themeTop");

if (themeTop) {

  themeTop.onclick = () => {

    applyTheme(
      state.theme === "dark"
        ? "light"
        : "dark"
    );
  };
}


// =====================================================
// THEME SELECT
// =====================================================

const themeSelect =
  $("#themeSelect");

if (themeSelect) {

  themeSelect.value =
    state.theme;

  themeSelect.onchange =
    event => {

      applyTheme(
        event.target.value
      );
    };
}


// =====================================================
// MODEL SELECT
// =====================================================

const modelSelect =
  $("#modelSelect");

if (modelSelect) {

  modelSelect.value =
    state.model;

  modelSelect.onchange =
    event => {

      state.model =
        event.target.value;

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
            event.target.options[
              event.target.selectedIndex
            ].text;
        }
      }

      toast(
        "تم تغيير النموذج"
      );
    };
}


// =====================================================
// SIDEBAR
// =====================================================

const openSidebar =
  $("#openSidebar");

if (openSidebar) {

  openSidebar.onclick =
    () => {

      sidebar.classList.add(
        "open"
      );
    };
}


const closeSidebar =
  $("#closeSidebar");

if (closeSidebar) {

  closeSidebar.onclick =
    () => {

      sidebar.classList.remove(
        "open"
      );
    };
}


// =====================================================
// SETTINGS MODAL
// =====================================================

const settingsBtn =
  $("#settingsBtn");

if (settingsBtn) {

  settingsBtn.onclick =
    () => {

      $("#modalBackdrop")
        ?.classList
        .remove("hidden");
    };
}


const modalClose =
  $("#modalClose");

if (modalClose) {

  modalClose.onclick =
    () => {

      $("#modalBackdrop")
        ?.classList
        .add("hidden");
    };
}


const modalBackdrop =
  $("#modalBackdrop");

if (modalBackdrop) {

  modalBackdrop.onclick =
    event => {

      if (
        event.target ===
        modalBackdrop
      ) {

        modalBackdrop.classList.add(
          "hidden"
        );
      }
    };
}


// =====================================================
// INITIALIZE
// =====================================================

applyTheme(
  state.theme
);

if (modelSelect) {
  modelSelect.value =
    state.model;
}

renderMessages();
