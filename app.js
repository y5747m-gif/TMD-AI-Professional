const state = {
  messages: JSON.parse(
    localStorage.getItem("tmd_messages") || "[]"
  ),
  busy: false,
  user: null
};


const $ = (id) =>
  document.getElementById(id);


const chat = $("chat");
const input = $("input");
const composer = $("composer");
const send = $("send");
const welcome = $("welcome");

const loginScreen = $("loginScreen");
const app = $("app");

const loginForm = $("loginForm");
const loginUser = $("loginUser");
const loginPass = $("loginPass");
const loginError = $("loginError");

const ownerBtn = $("ownerBtn");
const ownerModal = $("ownerModal");
const userBadge = $("userBadge");


/* =========================
   STORAGE
========================= */

function saveMessages() {
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


/* =========================
   MESSAGES
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

  avatar.className = "avatar";

  avatar.textContent =
    role === "user"
      ? "أنت"
      : "T";


  const bubble =
    document.createElement("div");

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
    .forEach((element) =>
      element.remove()
    );


  welcome.style.display =
    state.messages.length
      ? "none"
      : "grid";


  state.messages.forEach(
    (message) => {

      addMessage(
        message.role,
        message.content
      );

    }
  );

}


/* =========================
   BUSY
========================= */

function setBusy(value) {

  state.busy = value;

  send.disabled = value;

  send.textContent =
    value
      ? "…"
      : "➤";

}


/* =========================
   CHAT
========================= */

function newChat() {

  state.messages = [];

  saveMessages();

  render();

  input.focus();

}


async function sendMessage(text) {

  const message =
    text.trim();


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

  input.style.height = "auto";

  setBusy(true);


  const typing =
    document.createElement("div");


  typing.className =
    "message-row assistant";


  typing.innerHTML =
    `
      <div class="avatar">T</div>

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

          credentials: "include",

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


    state.messages.push({
      role: "assistant",
      content: data.message
    });


    saveMessages();

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


/* =========================
   LOGIN
========================= */

loginForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    loginError.textContent = "";

    const username =
      loginUser.value.trim();

    const password =
      loginPass.value;


    if (
      !username ||
      !password
    ) {
      loginError.textContent =
        "أدخل اسم المستخدم وكلمة المرور.";

      return;
    }


    const button =
      loginForm.querySelector("button");

    button.disabled = true;

    button.textContent =
      "جارٍ تسجيل الدخول...";


    try {

      const response =
        await fetch(
          "/api/login",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            credentials: "include",

            body: JSON.stringify({
              username,
              password
            })
          }
        );


      const data =
        await response
          .json()
          .catch(() => ({}));


      if (
        !response.ok ||
        !data.ok
      ) {

        throw new Error(
          data.error ||
          "فشل تسجيل الدخول."
        );

      }


      state.user =
        data.user;


      showApp();

    } catch (error) {

      loginError.textContent =
        error.message ||
        "حدث خطأ أثناء تسجيل الدخول.";

    } finally {

      button.disabled = false;

      button.textContent =
        "تسجيل الدخول";

    }

  }
);


/* =========================
   SESSION
========================= */

async function checkSession() {

  try {

    const response =
      await fetch(
        "/api/me",
        {
          credentials: "include",
          cache: "no-store"
        }
      );


    const data =
      await response.json();


    if (
      data.ok &&
      data.authenticated &&
      data.user
    ) {

      state.user =
        data.user;

      showApp();

      return;

    }

  } catch (_) {
    // عرض شاشة الدخول
  }


  showLogin();

}


function showLogin() {

  loginScreen.classList.remove(
    "hidden"
  );

  app.classList.add(
    "hidden"
  );

}


function showApp() {

  loginScreen.classList.add(
    "hidden"
  );

  app.classList.remove(
    "hidden"
  );


  userBadge.textContent =
    `👤 ${state.user.username}`;


  if (
    state.user.role === "owner"
  ) {

    ownerBtn.classList.remove(
      "hidden"
    );

  } else {

    ownerBtn.classList.add(
      "hidden"
    );

  }


  render();

  input.focus();

}


/* =========================
   LOGOUT
========================= */

$("logout").addEventListener(
  "click",
  async () => {

    try {

      await fetch(
        "/api/logout",
        {
          method: "POST",
          credentials: "include"
        }
      );

    } catch (_) {}


    state.user = null;

    state.messages = [];

    saveMessages();

    loginUser.value = "";
    loginPass.value = "";

    showLogin();

    loginUser.focus();

  }
);


/* =========================
   SUBMIT
========================= */

composer.addEventListener(
  "submit",
  (event) => {

    event.preventDefault();

    sendMessage(
      input.value
    );

  }
);


/* =========================
   ENTER
========================= */

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


/* =========================
   TEXTAREA
========================= */

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


/* =========================
   QUICK PROMPTS
========================= */

document
  .querySelectorAll(
    "[data-prompt]"
  )
  .forEach(
    (button) => {

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


/* =========================
   NEW CHAT
========================= */

$("newChat").addEventListener(
  "click",
  newChat
);


/* =========================
   CLEAR CHAT
========================= */

$("clearChat").addEventListener(
  "click",
  newChat
);


/* =========================
   THEME
========================= */

$("theme").addEventListener(
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


/* =========================
   OWNER PANEL
========================= */

function applySettings() {

  const settings =
    JSON.parse(
      localStorage.getItem(
        "tmd_owner_settings"
      ) || "{}"
    );


  if (settings.gold) {

    document.documentElement
      .style.setProperty(
        "--gold",
        settings.gold
      );

  }


  if (settings.gold2) {

    document.documentElement
      .style.setProperty(
        "--gold2",
        settings.gold2
      );

  }


  if (settings.bg) {

    document.documentElement
      .style.setProperty(
        "--bg",
        settings.bg
      );

  }


  if (
    settings.desert === false
  ) {

    document.body.classList.add(
      "no-desert"
    );

  } else {

    document.body.classList.remove(
      "no-desert"
    );

  }

}


ownerBtn.addEventListener(
  "click",
  () => {

    if (
      state.user?.role !== "owner"
    ) {
      return;
    }


    const settings =
      JSON.parse(
        localStorage.getItem(
          "tmd_owner_settings"
        ) || "{}"
      );


    $("goldPicker").value =
      settings.gold ||
      "#d4af37";


    $("bgPicker").value =
      settings.bg ||
      "#0d0b08";


    $("desertToggle").checked =
      settings.desert !== false;


    ownerModal.classList.remove(
      "hidden"
    );

  }
);


$("closeOwner").addEventListener(
  "click",
  () => {

    ownerModal.classList.add(
      "hidden"
    );

  }
);


$("saveOwner").addEventListener(
  "click",
  () => {

    if (
      state.user?.role !== "owner"
    ) {
      return;
    }


    localStorage.setItem(
      "tmd_owner_settings",

      JSON.stringify({
        gold:
          $("goldPicker").value,

        gold2:
          $("goldPicker").value,

        bg:
          $("bgPicker").value,

        desert:
          $("desertToggle").checked
      })
    );


    applySettings();


    ownerModal.classList.add(
      "hidden"
    );

  }
);


/* =========================
   THEME RESTORE
========================= */

if (
  localStorage.getItem(
    "tmd_theme"
  ) === "light"
) {

  document.body.classList.add(
    "light"
  );

}


/* =========================
   START
========================= */

applySettings();

checkSession();
