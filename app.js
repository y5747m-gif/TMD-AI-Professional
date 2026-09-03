const state = {
  messages: loadMessages(),
  busy: false
};


/* ================= ELEMENTS ================= */

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const send = document.getElementById("send");
const welcome = document.getElementById("welcome");

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const themeButton = document.getElementById("theme");


/* ================= STORAGE ================= */

function loadMessages() {
  try {

    const saved =
      localStorage.getItem("tmd_messages");

    if (!saved) {
      return [];
    }

    const parsed =
      JSON.parse(saved);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {

    console.warn(
      "Unable to load saved messages.",
      error
    );

    return [];
  }
}


function save() {

  try {

    localStorage.setItem(
      "tmd_messages",
      JSON.stringify(state.messages)
    );

  } catch (error) {

    console.warn(
      "Unable to save messages.",
      error
    );

  }

}


/* ================= SCROLL ================= */

function scrollBottom() {

  requestAnimationFrame(() => {

    chat.scrollTop =
      chat.scrollHeight;

  });

}


/* ================= ADD MESSAGE ================= */

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
      : "T";


  const bubble =
    document.createElement("div");

  bubble.className =
    "bubble";

  bubble.textContent =
    String(text || "");


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


/* ================= RENDER ================= */

function render() {

  chat
    .querySelectorAll(".message-row")
    .forEach((element) => {

      element.remove();

    });


  welcome.style.display =
    state.messages.length
      ? "none"
      : "flex";


  state.messages.forEach((message) => {

    if (
      !message ||
      !message.role ||
      typeof message.content !== "string"
    ) {
      return;
    }


    addMessage(
      message.role,
      message.content
    );

  });


  scrollBottom();

}


/* ================= BUSY ================= */

function setBusy(value) {

  state.busy =
    Boolean(value);


  send.disabled =
    state.busy;


  send.textContent =
    state.busy
      ? "…"
      : "➤";

}


/* ================= SIDEBAR ================= */

function closeSidebar() {

  sidebar.classList.remove("open");

  overlay.classList.remove("show");

}


function openSidebar() {

  sidebar.classList.add("open");

  overlay.classList.add("show");

}


/* ================= NEW CHAT ================= */

function newChat() {

  state.messages = [];

  save();

  render();

  input.value = "";

  input.style.height =
    "auto";

  input.focus();

}


/* ================= SEND MESSAGE ================= */

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


  save();

  render();


  input.value =
    "";

  input.style.height =
    "auto";


  setBusy(true);


  /* ================= TYPING ================= */

  const typing =
    document.createElement("div");


  typing.className =
    "message-row assistant";


  typing.innerHTML =

    '<div class="avatar">T</div>' +

    '<div class="bubble typing">' +

    "<span></span>" +

    "<span></span>" +

    "<span></span>" +

    "</div>";


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
        .catch(() => ({}));


    typing.remove();


    if (
      !response.ok ||
      !data ||
      data.ok !== true
    ) {

      throw new Error(

        data &&
        typeof data.error === "string"

          ? data.error

          : `HTTP ${response.status}`

      );

    }


    const answer =
      typeof data.message === "string"
        ? data.message.trim()
        : "";


    if (!answer) {

      throw new Error(
        "لم تصل إجابة من الخادم."
      );

    }


    state.messages.push({

      role: "assistant",

      content: answer

    });


    save();

    render();


  } catch (error) {

    typing.remove();


    const errorMessage =
      error &&
      error.message

        ? error.message

        : "تعذر الاتصال بالخادم.";


    addMessage(

      "assistant",

      `حدث خطأ: ${errorMessage}`,

      true

    );

  } finally {

    setBusy(false);

    input.focus();

  }

}


/* ================= FORM ================= */

composer.addEventListener(
  "submit",
  (event) => {

    event.preventDefault();

    sendMessage(
      input.value
    );

  }
);


/* ================= ENTER ================= */

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


/* ================= TEXTAREA ================= */

input.addEventListener(
  "input",
  () => {

    input.style.height =
      "auto";


    input.style.height =
      Math.min(
        input.scrollHeight,
        170
      ) + "px";

  }
);


/* ================= QUICK PROMPTS ================= */

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


/* ================= NEW CHAT ================= */

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


/* ================= CLEAR CHAT ================= */

const clearChatButton =
  document.getElementById(
    "clearChat"
  );


if (clearChatButton) {

  clearChatButton.addEventListener(
    "click",
    () => {

      newChat();

    }
  );

}


/* ================= THEME ================= */

function applyTheme(theme) {

  document.body.classList.toggle(
    "light",
    theme === "light"
  );

}


themeButton.addEventListener(
  "click",
  () => {

    const isLight =
      document.body.classList.contains(
        "light"
      );


    const newTheme =
      isLight
        ? "dark"
        : "light";


    applyTheme(
      newTheme
    );


    localStorage.setItem(
      "tmd_theme",
      newTheme
    );

  }
);


/* ================= MOBILE MENU ================= */

const menuButton =
  document.getElementById(
    "menuBtn"
  );


if (menuButton) {

  menuButton.addEventListener(
    "click",
    openSidebar
  );

}


overlay.addEventListener(
  "click",
  closeSidebar
);


/* ================= SAVED THEME ================= */

const savedTheme =
  localStorage.getItem(
    "tmd_theme"
  );


if (savedTheme === "light") {

  applyTheme("light");

} else {

  applyTheme("dark");

}


/* ================= START ================= */

render();

input.focus();
