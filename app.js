const state = {
  messages: JSON.parse(
    localStorage.getItem("tmd_messages") || "[]"
  ),
  busy: false
};

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const send = document.getElementById("send");
const welcome = document.getElementById("welcome");


// ===============================
// حفظ المحادثة
// ===============================

function save() {
  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(state.messages)
  );
}


// ===============================
// النزول لآخر رسالة
// ===============================

function scrollBottom() {
  requestAnimationFrame(() => {
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  });
}


// ===============================
// إضافة رسالة
// ===============================

function addMessage(role, text, isError = false) {

  if (!chat) return;

  const row = document.createElement("div");

  row.className =
    `message-row ${role}${isError ? " error" : ""}`;


  const avatar = document.createElement("div");

  avatar.className = "avatar";

  avatar.textContent =
    role === "user"
      ? "أنت"
      : "T";


  const bubble = document.createElement("div");

  bubble.className = "bubble";

  bubble.textContent =
    typeof text === "string"
      ? text
      : String(text);


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


// ===============================
// عرض المحادثة
// ===============================

function render() {

  if (!chat) return;


  chat
    .querySelectorAll(".message-row")
    .forEach((element) => {
      element.remove();
    });


  if (welcome) {

    welcome.style.display =
      state.messages.length
        ? "none"
        : "grid";

  }


  state.messages.forEach((message) => {

    addMessage(
      message.role,
      message.content
    );

  });

}


// ===============================
// حالة الإرسال
// ===============================

function setBusy(value) {

  state.busy = value;


  if (send) {

    send.disabled = value;

    send.textContent =
      value
        ? "…"
        : "➤";

  }

}


// ===============================
// محادثة جديدة
// ===============================

function newChat() {

  state.messages = [];

  save();

  render();

  if (input) {
    input.focus();
  }

}


// ===============================
// إرسال رسالة
// ===============================

async function sendMessage(text) {

  const message =
    typeof text === "string"
      ? text.trim()
      : "";


  if (
    !message ||
    state.busy
  ) {
    return;
  }


  // إضافة رسالة المستخدم

  state.messages.push({
    role: "user",
    content: message
  });


  save();

  render();


  // تنظيف مربع الكتابة

  if (input) {

    input.value = "";

    input.style.height = "auto";

  }


  setBusy(true);


  // مؤشر الكتابة

  const typing =
    document.createElement("div");


  typing.className =
    "message-row assistant";


  typing.innerHTML =
    '<div class="avatar">T</div>' +
    '<div class="bubble typing">' +
    '<span></span>' +
    '<span></span>' +
    '<span></span>' +
    '</div>';


  if (chat) {

    chat.appendChild(typing);

    scrollBottom();

  }


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

          body: JSON.stringify({
            messages:
              state.messages
          })
        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


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


    // إضافة رد الذكاء الاصطناعي

    state.messages.push({

      role: "assistant",

      content:
        data.message

    });


    save();

    render();


  } catch (error) {

    typing.remove();


    addMessage(
      "assistant",

      `حدث خطأ: ${
        error.message ||
        "تعذر الاتصال بالخادم."
      }`,

      true
    );


  } finally {

    setBusy(false);

    if (input) {
      input.focus();
    }

  }

}


// ===============================
// إرسال النموذج
// ===============================

if (composer) {

  composer.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();

      if (input) {
        sendMessage(input.value);
      }

    }
  );

}


// ===============================
// زر Enter
// ===============================

if (input) {

  input.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        if (composer) {
          composer.requestSubmit();
        }

      }

    }
  );


  // =============================
  // تغيير ارتفاع مربع الكتابة
  // =============================

  input.addEventListener(
    "input",
    () => {

      input.style.height = "auto";

      input.style.height =
        Math.min(
          input.scrollHeight,
          170
        ) + "px";

    }
  );

}


// ===============================
// الأزرار الجاهزة
// ===============================

document
  .querySelectorAll("[data-prompt]")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        if (!input) return;


        input.value =
          button.dataset.prompt || "";


        input.focus();


        input.dispatchEvent(
          new Event("input")
        );

      }
    );

  });


// ===============================
// محادثة جديدة
// ===============================

const newChatButton =
  document.getElementById("newChat");


if (newChatButton) {

  newChatButton.addEventListener(
    "click",
    () => {

      newChat();

    }
  );

}


// ===============================
// مسح المحادثة
// ===============================

const clearChatButton =
  document.getElementById("clearChat");


if (clearChatButton) {

  clearChatButton.addEventListener(
    "click",
    () => {

      newChat();

    }
  );

}


// ===============================
// الوضع الليلي / الفاتح
// ===============================

const themeButton =
  document.getElementById("theme");


if (themeButton) {

  themeButton.addEventListener(
    "click",
    () => {

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
  );

}


// ===============================
// استرجاع المظهر
// ===============================

if (
  localStorage.getItem(
    "tmd_theme"
  ) === "light"
) {

  document.body.classList.add(
    "light"
  );

}


// ===============================
// تشغيل الموقع
// ===============================

render();
