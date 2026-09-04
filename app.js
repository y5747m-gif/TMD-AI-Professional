"use strict";

const state = {

  messages:
    JSON.parse(
      localStorage.getItem(
        "tmd_messages"
      ) || "[]"
    ),

  conversations:
    JSON.parse(
      localStorage.getItem(
        "tmd_conversations"
      ) || "[]"
    ),

  theme:
    localStorage.getItem(
      "tmd_theme"
    ) || "dark",

  model:
    localStorage.getItem(
      "tmd_model"
    ) || "llama-3.1-8b-instant",

  busy: false,

  controller: null,

  selectedImage: null,

  selectedDocument: null,

  imageMode: "analyze"

};
