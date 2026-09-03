"use strict";


/* =====================================================
   T.M.D AI
   Frontend Controller
===================================================== */


/* ================= DEFAULT SETTINGS ================= */

const DEFAULT_SETTINGS = {

  siteName: "T.M.D AI",

  siteDescription: "المساعد الذكي",

  developerName: "ياسين عمرو عبد الرحيم",

  logoText: "T",

  logoUrl: "",

  faviconUrl: "",

  backgroundImage: "",

  primaryColor: "#c9a227",

  textColor: "#f5f7fb",

  backgroundColor: "#080b12",

  panelColor: "#0d111b",

  borderColor: "#202a3b",

  iconColor: "#c9a227",

  showWelcome: true,

  showSuggestions: true,

  showDeveloper: true,

  enableImageTools: true,

  suggestions: [

    {
      title: "شرح الذكاء الاصطناعي",
      icon: "🤖",
      prompt: "اشرح لي الذكاء الاصطناعي بطريقة بسيطة"
    },

    {
      title: "اكتب كود",
      icon: "💻",
      prompt: "اكتب لي كود HTML احترافي"
    },

    {
      title: "حل مسألة",
      icon: "🧮",
      prompt: "حل لي هذه المسألة خطوة بخطوة"
    },

    {
      title: "سؤال ديني",
      icon: "📖",
      prompt: "اشرح لي هذه المسألة الدينية مع ذكر المصادر المؤكدة فقط"
    }

  ]

};


/* ================= STATE ================= */

const state = {

  messages: JSON.parse(
    localStorage.getItem("tmd_messages") || "[]"
  ),

  busy: false,

  selectedImage: null,

  settings: {
    ...DEFAULT_SETTINGS
  }

};


/* ================= ELEMENTS ================= */

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

const plusButton =
  document.getElementById("plusButton");

const plusMenu =
  document.getElementById("plusMenu");

const imageInput =
  document.getElementById("imageInput");

const imagePreview =
  document.getElementById("imagePreview");

const previewImage =
  document.getElementById("previewImage");

const imageName =
  document.getElementById("imageName");

const removeImage =
  document.getElementById("removeImage");

const sidebar =
  document.getElementById("sidebar");

const overlay =
  document.getElementById("overlay");


/* ================= STORAGE ================= */

function saveMessages(){

  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(state.messages)
  );

}


function saveLocalSettings(){

  localStorage.setItem(
    "tmd_settings",
    JSON.stringify(state.settings)
  );

}


function loadLocalSettings(){

  try{

    const raw =
      localStorage.getItem("tmd_settings");

    if(!raw){
      return;
    }

    const saved =
      JSON.parse(raw);

    state.settings = {

      ...DEFAULT_SETTINGS,

      ...saved

    };

  }catch(error){

    console.error(
      "Settings load error:",
      error
    );

  }

}


/* ================= COLORS ================= */

function applySettings(){

  const s =
    state.settings;


  document.documentElement.style.setProperty(
    "--accent",
    s.primaryColor
  );

  document.documentElement.style.setProperty(
    "--text",
    s.textColor
  );

  document.documentElement.style.setProperty(
    "--bg",
    s.backgroundColor
  );

  document.documentElement.style.setProperty(
    "--panel",
    s.panelColor
  );

  document.documentElement.style.setProperty(
    "--border",
    s.borderColor
  );

  document.documentElement.style.setProperty(
    "--icon",
    s.iconColor
  );


  document.title =
    `${s.siteName} — ${s.siteDescription}`;


  document.getElementById(
    "siteName"
  ).textContent =
    s.siteName;


  document.getElementById(
    "topSiteName"
  ).textContent =
    s.siteName;


  document.getElementById(
    "welcomeSiteName"
  ).textContent =
    s.siteName;


  document.getElementById(
    "siteDescription"
  ).textContent =
    s.siteDescription;


  document.getElementById(
    "welcomeDescription"
  ).textContent =
    s.siteDescription;


  document.getElementById(
    "developer"
  ).textContent =
    s.showDeveloper
      ? `المطور: ${s.developerName}`
      : "";


  document.getElementById(
    "developer"
  ).style.display =
    s.showDeveloper
      ? "block"
      : "none";


  /* background */

  if(s.backgroundImage){

    document.body.style.backgroundImage =
      `url("${s.backgroundImage}")`;

    document.body.classList.add(
      "custom-background"
    );

  }else{

    document.body.style.backgroundImage =
      "";

    document.body.classList.remove(
      "custom-background"
    );

  }


  /* logo */

  const brandText =
    document.getElementById(
      "brandText"
    );

  const welcomeText =
    document.getElementById(
      "welcomeLogoText"
    );

  const brandImage =
    document.getElementById(
      "brandImage"
    );

  const welcomeImage =
    document.getElementById(
      "welcomeLogoImage"
    );


  if(s.logoUrl){

    brandImage.src =
      s.logoUrl;

    brandImage.hidden =
      false;

    brandText.hidden =
      true;


    welcomeImage.src =
      s.logoUrl;

    welcomeImage.hidden =
      false;

    welcomeText.hidden =
      true;

  }else{

    brandImage.hidden =
      true;

    brandText.hidden =
      false;

    brandText.textContent =
      s.logoText || "T";


    welcomeImage.hidden =
      true;

    welcomeText.hidden =
      false;

    welcomeText.textContent =
      s.logoText || "T";

  }


  /* favicon */

  if(s.faviconUrl){

    document.getElementById(
      "favicon"
    ).href =
      s.faviconUrl;

  }


  renderSuggestions();

  updateImageTools();

}


/* ================= SUGGESTIONS ================= */

function renderSuggestions(){

  const container =
    document.getElementById(
      "suggestions"
    );

  const cards =
    document.getElementById(
      "welcomeCards"
    );


  container.innerHTML = "";

  cards.innerHTML = "";


  if(!state.settings.showSuggestions){

    document.querySelector(
      ".quick-title"
    ).style.display =
      "none";

    return;

  }


  document.querySelector(
    ".quick-title"
  ).style.display =
    "block";


  const suggestions =
    state.settings.suggestions || [];


  suggestions.forEach(
    suggestion => {

      const button =
        createSuggestionButton(
          suggestion
        );

      container.appendChild(
        button
      );


      const card =
        createSuggestionButton(
          suggestion
        );

      cards.appendChild(
        card
      );

    }
  );

}


function createSuggestionButton(
  suggestion
){

  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.className =
    "suggestion";

  button.textContent =
    `${suggestion.icon || "💡"} ${suggestion.title}`;

  button.addEventListener(
    "click",
    () => {

      input.value =
        suggestion.prompt;

      input.focus();

      input.dispatchEvent(
        new Event("input")
      );

    }
  );

  return button;

}


/* ================= IMAGE TOOLS ================= */

function updateImageTools(){

  const enabled =
    state.settings.enableImageTools;


  plusButton.style.display =
    enabled
      ? "block"
      : "none";


  if(!enabled){

    plusMenu.classList.remove(
      "show"
    );

    clearImage();

  }

}


/* ================= SCROLL ================= */

function scrollBottom(){

  requestAnimationFrame(
    () => {

      chat.scrollTop =
        chat.scrollHeight;

    }
  );

}


/* ================= MESSAGE ================= */

function addMessage(
  role,
  text,
  isError = false,
  imageData = null
){

  const row =
    document.createElement(
      "div"
    );

  row.className =
    `message-row ${role}`;

  if(isError){

    row.classList.add(
      "error"
    );

  }


  const avatar =
    document.createElement(
      "div"
    );

  avatar.className =
    "avatar";


  if(role === "user"){

    avatar.textContent =
      "أنت";

  }else{

    if(state.settings.logoUrl){

      const img =
        document.createElement(
          "img"
        );

      img.src =
        state.settings.logoUrl;

      img.alt =
        "T.M.D AI";

      avatar.appendChild(
        img
      );

    }else{

      avatar.textContent =
        state.settings.logoText || "T";

    }

  }


  const bubble =
    document.createElement(
      "div"
    );

  bubble.className =
    "bubble";


  if(imageData){

    const imageWrapper =
      document.createElement(
        "div"
      );

    imageWrapper.className =
      "image-message";


    const img =
      document.createElement(
        "img"
      );

    img.src =
      imageData;

    img.alt =
      "الصورة المرفقة";


    imageWrapper.appendChild(
      img
    );

    bubble.appendChild(
      imageWrapper
    );

  }


  const textElement =
    document.createElement(
      "div"
    );

  textElement.textContent =
    text;


  bubble.appendChild(
    textElement
  );


  if(role === "user"){

    row.append(
      bubble,
      avatar
    );

  }else{

    row.append(
      avatar,
      bubble
    );

  }


  chat.appendChild(
    row
  );


  scrollBottom();

  return row;

}


/* ================= RENDER ================= */

function render(){

  chat
    .querySelectorAll(
      ".message-row"
    )
    .forEach(
      element =>
        element.remove()
    );


  welcome.style.display =
    state.messages.length ||
    !state.settings.showWelcome
      ? "none"
      : "grid";


  state.messages.forEach(
    message => {

      addMessage(
        message.role,
        message.content,
        false,
        message.image || null
      );

    }
  );


  scrollBottom();

}


/* ================= BUSY ================= */

function setBusy(
  value
){

  state.busy =
    value;

  send.disabled =
    value;

  send.textContent =
    value
      ? "…"
      : "➤";

}


/* ================= SEND ================= */

async function sendMessage(
  text
){

  const message =
    text.trim();


  if(
    !message &&
    !state.selectedImage
  ){

    return;

  }


  if(state.busy){

    return;

  }


  const image =
    state.selectedImage;


  state.messages.push({

    role:
      "user",

    content:
      message ||
      "حلل هذه الصورة.",

    image:
      image
        ? image.dataUrl
        : null

  });


  saveMessages();

  render();


  input.value =
    "";

  input.style.height =
    "auto";


  clearImage();

  setBusy(true);


  const typing =
    document.createElement(
      "div"
    );

  typing.className =
    "message-row assistant";


  typing.innerHTML =
    `
      <div class="avatar">
        ${state.settings.logoUrl
          ? `<img src="${escapeAttribute(state.settings.logoUrl)}" alt="">`
          : escapeHtml(state.settings.logoText || "T")}
      </div>

      <div class="bubble typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;


  chat.appendChild(
    typing
  );

  scrollBottom();


  try{

    const payload = {

      messages:
        state.messages.map(
          item => ({

            role:
              item.role,

            content:
              item.content,

            image:
              item.image || null

          })
        )

    };


    const response =
      await fetch(
        "/api/chat",
        {

          method:
            "POST",

          headers:
            {
              "Content-Type":
                "application/json"
            },

          body:
            JSON.stringify(
              payload
            )

        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    typing.remove();


    if(
      !response.ok ||
      !data.ok
    ){

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );

    }


    state.messages.push({

      role:
        "assistant",

      content:
        data.message

    });


    saveMessages();

    render();


  }catch(error){

    typing.remove();


    addMessage(
      "assistant",
      `حدث خطأ: ${error.message}`,
      true
    );

  }finally{

    setBusy(false);

    input.focus();

  }

}


/* ================= IMAGE READER ================= */

function readImageFile(
  file
){

  return new Promise(
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


/* ================= SELECT IMAGE ================= */

async function selectImage(
  file
){

  if(!file){

    return;

  }


  if(
    !file.type.startsWith(
      "image/"
    )
  ){

    alert(
      "يرجى اختيار ملف صورة."
    );

    return;

  }


  /* 10MB */

  if(
    file.size >
    10 * 1024 * 1024
  ){

    alert(
      "حجم الصورة يجب ألا يتجاوز 10MB."
    );

    return;

  }


  try{

    const dataUrl =
      await readImageFile(
        file
      );


    state.selectedImage = {

      file,

      dataUrl

    };


    previewImage.src =
      dataUrl;


    imageName.textContent =
      file.name;


    imagePreview.hidden =
      false;


    plusMenu.classList.remove(
      "show"
    );


  }catch(error){

    alert(
      error.message
    );

  }

}


/* ================= CLEAR IMAGE ================= */

function clearImage(){

  state.selectedImage =
    null;


  previewImage.src =
    "";


  imageName.textContent =
    "";


  imagePreview.hidden =
    true;


  imageInput.value =
    "";

}


/* ================= OWNER ================= */

function openOwnerModal(){

  document.getElementById(
    "ownerModal"
  ).hidden =
    false;


  document.getElementById(
    "ownerPassword"
  ).value =
    "";


  showOwnerLogin();

}


function closeOwnerModal(){

  document.getElementById(
    "ownerModal"
  ).hidden =
    true;

}


function showOwnerLogin(){

  document.getElementById(
    "ownerLoginSection"
  ).hidden =
    false;


  document.getElementById(
    "ownerPanelSection"
  ).hidden =
    true;

}


function showOwnerPanel(){

  document.getElementById(
    "ownerLoginSection"
  ).hidden =
    true;


  document.getElementById(
    "ownerPanelSection"
  ).hidden =
    false;


  fillOwnerForm();

}


/* ================= OWNER LOGIN ================= */

async function ownerLogin(
  password
){

  const errorBox =
    document.getElementById(
      "ownerLoginError"
    );


  errorBox.textContent =
    "";


  try{

    const response =
      await fetch(
        "/api/owner-login",
        {

          method:
            "POST",

          headers:
            {
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


    if(
      !response.ok ||
      !data.ok
    ){

      throw new Error(
        data.error ||
        "كلمة المرور غير صحيحة."
      );

    }


    sessionStorage.setItem(
      "tmd_owner",
      data.token || "authenticated"
    );


    showOwnerPanel();


  }catch(error){

    errorBox.textContent =
      error.message;

  }

}


/* ================= OWNER FORM ================= */

function fillOwnerForm(){

  const s =
    state.settings;


  document.getElementById(
    "settingSiteName"
  ).value =
    s.siteName;


  document.getElementById(
    "settingDescription"
  ).value =
    s.siteDescription;


  document.getElementById(
    "settingDeveloper"
  ).value =
    s.developerName;


  document.getElementById(
    "settingLogoText"
  ).value =
    s.logoText;


  document.getElementById(
    "settingPrimaryColor"
  ).value =
    s.primaryColor;


  document.getElementById(
    "settingTextColor"
  ).value =
    s.textColor;


  document.getElementById(
    "settingBackgroundColor"
  ).value =
    s.backgroundColor;


  document.getElementById(
    "settingPanelColor"
  ).value =
    s.panelColor;


  document.getElementById(
    "settingBorderColor"
  ).value =
    s.borderColor;


  document.getElementById(
    "settingIconColor"
  ).value =
    s.iconColor;


  document.getElementById(
    "settingLogoUrl"
  ).value =
    s.logoUrl;


  document.getElementById(
    "settingFaviconUrl"
  ).value =
    s.faviconUrl;


  document.getElementById(
    "settingBackgroundImage"
  ).value =
    s.backgroundImage;


  document.getElementById(
    "settingShowWelcome"
  ).checked =
    s.showWelcome;


  document.getElementById(
    "settingShowSuggestions"
  ).checked =
    s.showSuggestions;


  document.getElementById(
    "settingShowDeveloper"
  ).checked =
    s.showDeveloper;


  document.getElementById(
    "settingEnableImageTools"
  ).checked =
    s.enableImageTools;

}


/* ================= READ OWNER FORM ================= */

function readOwnerForm(){

  const s = {

    ...state.settings

  };


  s.siteName =
    document.getElementById(
      "settingSiteName"
    ).value.trim()
    || DEFAULT_SETTINGS.siteName;


  s.siteDescription =
    document.getElementById(
      "settingDescription"
    ).value.trim()
    || DEFAULT_SETTINGS.siteDescription;


  s.developerName =
    document.getElementById(
      "settingDeveloper"
    ).value.trim()
    || DEFAULT_SETTINGS.developerName;


  s.logoText =
    document.getElementById(
      "settingLogoText"
    ).value.trim()
    || DEFAULT_SETTINGS.logoText;


  s.primaryColor =
    document.getElementById(
      "settingPrimaryColor"
    ).value;


  s.textColor =
    document.getElementById(
      "settingTextColor"
    ).value;


  s.backgroundColor =
    document.getElementById(
      "settingBackgroundColor"
    ).value;


  s.panelColor =
    document.getElementById(
      "settingPanelColor"
    ).value;


  s.borderColor =
    document.getElementById(
      "settingBorderColor"
    ).value;


  s.iconColor =
    document.getElementById(
      "settingIconColor"
    ).value;


  s.logoUrl =
    document.getElementById(
      "settingLogoUrl"
    ).value.trim();


  s.faviconUrl =
    document.getElementById(
      "settingFaviconUrl"
    ).value.trim();


  s.backgroundImage =
    document.getElementById(
      "settingBackgroundImage"
    ).value.trim();


  s.showWelcome =
    document.getElementById(
      "settingShowWelcome"
    ).checked;


  s.showSuggestions =
    document.getElementById(
      "settingShowSuggestions"
    ).checked;


  s.showDeveloper =
    document.getElementById(
      "settingShowDeveloper"
    ).checked;


  s.enableImageTools =
    document.getElementById(
      "settingEnableImageTools"
    ).checked;


  return s;

}


/* ================= SAVE SETTINGS ================= */

async function saveSettings(){

  const message =
    document.getElementById(
      "settingsMessage"
    );


  const token =
    sessionStorage.getItem(
      "tmd_owner"
    );


  if(!token){

    message.textContent =
      "يجب تسجيل الدخول أولًا.";

    message.className =
      "form-message error";

    return;

  }


  const settings =
    readOwnerForm();


  state.settings =
    settings;


  /*
    نحفظ نسخة على الجهاز أيضًا.
    في حالة إعداد API للتخزين المركزي
    سيتم إرسالها إلى الخادم كذلك.
  */

  saveLocalSettings();


  applySettings();

  render();


  try{

    const response =
      await fetch(
        "/api/settings",
        {

          method:
            "POST",

          headers:
            {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`
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


    if(response.ok && data.ok){

      state.settings =
        {
          ...state.settings,
          ...(data.settings || {})
        };

      saveLocalSettings();

      applySettings();

      render();

      message.textContent =
        "✅ تم حفظ إعدادات الموقع.";

      message.className =
        "form-message";

    }else{

      message.textContent =
        "✅ تم حفظ الإعدادات على هذا الجهاز.";

      message.className =
        "form-message";

    }


  }catch(error){

    console.warn(
      "Settings server unavailable:",
      error
    );


    message.textContent =
      "✅ تم حفظ الإعدادات محليًا.";

    message.className =
      "form-message";

  }

}


/* ================= RESET SETTINGS ================= */

function resetSettings(){

  const confirmed =
    confirm(
      "هل تريد استعادة إعدادات الموقع الافتراضية؟"
    );


  if(!confirmed){

    return;

  }


  state.settings =
    JSON.parse(
      JSON.stringify(
        DEFAULT_SETTINGS
      )
    );


  saveLocalSettings();

  applySettings();

  render();

  fillOwnerForm();


  document.getElementById(
    "settingsMessage"
  ).textContent =
    "تم استعادة الإعدادات الافتراضية.";

}


/* ================= LOGOUT ================= */

function ownerLogout(){

  sessionStorage.removeItem(
    "tmd_owner"
  );

  showOwnerLogin();

}


/* ================= FILE UPLOADS ================= */

async function uploadOwnerFile(
  file,
  type
){

  if(!file){

    return;

  }


  if(
    !file.type.startsWith(
      "image/"
    )
  ){

    return;

  }


  if(
    file.size >
    5 * 1024 * 1024
  ){

    alert(
      "حجم الصورة يجب ألا يتجاوز 5MB."
    );

    return;

  }


  try{

    const dataUrl =
      await readImageFile(
        file
      );


    if(type === "logo"){

      state.settings.logoUrl =
        dataUrl;

      document.getElementById(
        "settingLogoUrl"
      ).value =
        dataUrl;


    }else{

      state.settings.backgroundImage =
        dataUrl;

      document.getElementById(
        "settingBackgroundImage"
      ).value =
        dataUrl;

    }


    applySettings();

    saveLocalSettings();


    document.getElementById(
      "settingsMessage"
    ).textContent =
      "تمت إضافة الصورة. اضغط حفظ التغييرات.";

  }catch(error){

    alert(
      error.message
    );

  }

}


/* ================= THEME ================= */

function toggleTheme(){

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


function loadTheme(){

  const theme =
    localStorage.getItem(
      "tmd_theme"
    );


  if(theme === "light"){

    document.body.classList.add(
      "light"
    );

  }

}


/* ================= MOBILE MENU ================= */

function openSidebar(){

  sidebar.classList.add(
    "open"
  );

  overlay.classList.add(
    "show"
  );

}


function closeSidebar(){

  sidebar.classList.remove(
    "open"
  );

  overlay.classList.remove(
    "show"
  );

}


/* ================= SECURITY HELPERS ================= */

function escapeHtml(
  value
){

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function escapeAttribute(
  value
){

  return escapeHtml(
    value
  );

}


/* ================= EVENTS ================= */

composer.addEventListener(
  "submit",
  event => {

    event.preventDefault();

    sendMessage(
      input.value
    );

  }
);


input.addEventListener(
  "keydown",
  event => {

    if(
      event.key === "Enter" &&
      !event.shiftKey
    ){

      event.preventDefault();

      composer.requestSubmit();

    }

  }
);


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


/* NEW CHAT */

document.getElementById(
  "newChat"
).addEventListener(
  "click",
  () => {

    state.messages =
      [];

    saveMessages();

    render();

    input.focus();

    closeSidebar();

  }
);


/* CLEAR */

document.getElementById(
  "clearChat"
).addEventListener(
  "click",
  () => {

    if(
      !confirm(
        "هل تريد مسح المحادثة؟"
      )
    ){

      return;

    }


    state.messages =
      [];

    saveMessages();

    render();

  }
);


/* THEME */

document.getElementById(
  "theme"
).addEventListener(
  "click",
  toggleTheme
);


document.getElementById(
  "topTheme"
).addEventListener(
  "click",
  toggleTheme
);


/* MOBILE */

document.getElementById(
  "menuBtn"
).addEventListener(
  "click",
  openSidebar
);


overlay.addEventListener(
  "click",
  closeSidebar
);


/* PLUS */

plusButton.addEventListener(
  "click",
  () => {

    plusMenu.classList.toggle(
      "show"
    );

  }
);


/* IMAGE */

document.getElementById(
  "imageUploadButton"
).addEventListener(
  "click",
  () => {

    imageInput.click();

  }
);


document.getElementById(
  "imageEditButton"
).addEventListener(
  "click",
  () => {

    imageInput.click();

    plusMenu.classList.remove(
      "show"
    );

  }
);


imageInput.addEventListener(
  "change",
  event => {

    const file =
      event.target.files[0];

    selectImage(
      file
    );

  }
);


removeImage.addEventListener(
  "click",
  clearImage
);


/* OWNER */

document.getElementById(
  "ownerButton"
).addEventListener(
  "click",
  openOwnerModal
);


document.getElementById(
  "closeOwnerModal"
).addEventListener(
  "click",
  closeOwnerModal
);


document.getElementById(
  "ownerLoginForm"
).addEventListener(
  "submit",
  event => {

    event.preventDefault();

    const password =
      document.getElementById(
        "ownerPassword"
      ).value;

    ownerLogin(
      password
    );

  }
);


document.getElementById(
  "saveSettings"
).addEventListener(
  "click",
  saveSettings
);


document.getElementById(
  "resetSettings"
).addEventListener(
  "click",
  resetSettings
);


document.getElementById(
  "ownerLogout"
).addEventListener(
  "click",
  ownerLogout
);


/* OWNER FILES */

document.getElementById(
  "logoFileInput"
).addEventListener(
  "change",
  event => {

    uploadOwnerFile(
      event.target.files[0],
      "logo"
    );

  }
);


document.getElementById(
  "backgroundFileInput"
).addEventListener(
  "change",
  event => {

    uploadOwnerFile(
      event.target.files[0],
      "background"
    );

  }
);


/* CLOSE MENU OUTSIDE */

document.addEventListener(
  "click",
  event => {

    if(
      !plusMenu.contains(
        event.target
      ) &&
      !plusButton.contains(
        event.target
      )
    ){

      plusMenu.classList.remove(
        "show"
      );

    }

  }
);


/* ================= INIT ================= */

loadLocalSettings();

loadTheme();

applySettings();

render();
