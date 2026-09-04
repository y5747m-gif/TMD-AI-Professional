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
  // File & Image State
  // =========================
  selectedImage: null,
  selectedDocument: null,
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
const analyzeDocumentButton = $("#analyzeDocumentButton");
const addImageButton = $("#addImageButton");
const imageEditButton = $("#imageEditButton");
const imageInput = $("#imageInput");
const documentInput = $("#documentInput");

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
    /```([\w+-]*)\n?([\s\S]*?)
