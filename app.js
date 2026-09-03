const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  busy: false
};

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const send = document.getElementById("send");
const welcome = document.getElementById("welcome");

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");


function save() {
  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(state.messages)
  );
}


function scrollBottom() {
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}


function addMessage(role, text, isError = false) {

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

  bubble.textContent = text;


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


function render() {

  chat
    .querySelectorAll(".message-row")
    .forEach((element) => element.remove());


  welcome.style.display =
    state.messages.length
      ? "none"
      : "flex";


  state.messages.forEach((message) => {

    addMessage(
      message.role,
      message.content
    );

  });

}


function setBusy(value) {

  state.busy = value;

  send.disabled = value;

  send.textContent =
    value
      ? "…"
      : "➤";

}


function closeSidebar() {

  sidebar.classList.remove("open");

  overlay.classList.remove("show");

}


function newChat() {

  state.messages = [];

  save();

  render();

  input.focus();

}


async function sendMessage(text) {

  const message = text.trim();


  if (!message || state.busy) {
    return;
  }


  state.messages.push({
    role: "user",
    content: message
  });


  save();

  render();


  input.value = "";

  input.style.height = "auto";


  setBusy(true);


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


  chat.appendChild(typing);

  scrollBottom();


  try {

    const response =
      await fetch("/api/chat", {

        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          messages: state.messages
        })

      });


    const data =
      await response
        .json()
        .catch(() => ({}));


    typing.remove();


    if (!response.ok || !data.ok) {

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );

    }


    state.messages.push({

      role: "assistant",

      content: data.message

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

    input.focus();

  }

}


/* إرسال */

composer.addEventListener(
  "submit",
  (event) => {

    event.preventDefault();

    sendMessage(input.value);

  }
);


/* Enter */

input.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      composer.requestSubmit();

    }

  }
);


/* تغيير حجم مربع الكتابة */

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


/* الأزرار الجاهزة */

document
  .querySelectorAll("[data-prompt]")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        input.value =
          button.dataset.prompt || "";

        input.focus();

        input.dispatchEvent(
          new Event("input")
        );

      }
    );

  });


/* محادثة جديدة */

document
  .getElementById("newChat")
  .addEventListener(
    "click",
    () => {

      newChat();

      closeSidebar();

    }
  );


/* مسح المحادثة */

document
  .getElementById("clearChat")
  .addEventListener(
    "click",
    () => {

      newChat();

    }
  );


/* الوضع الليلي / الفاتح */

document
  .getElementById("theme")
  .addEventListener(
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


/* قائمة الهاتف */

document
  .getElementById("menuBtn")
  .addEventListener(
    "click",
    () => {

      sidebar.classList.add("open");

      overlay.classList.add("show");

    }
  );


overlay.addEventListener(
  "click",
  closeSidebar
);


/* حفظ المظهر */

if (
  localStorage.getItem("tmd_theme") ===
  "light"
) {

  document.body.classList.add("light");

}


/* تشغيل الموقع */

render();
