const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  conversations: JSON.parse(localStorage.getItem("tmd_conversations") || "[]"),
  theme: localStorage.getItem("tmd_theme") || "dark",
  model: localStorage.getItem("tmd_model") || "llama-3.3-70b-versatile",
  busy: false,
  controller: null
};

const $ = s => document.querySelector(s);
const chat = $("#chat"), welcome = $("#welcome"), input = $("#input"), send = $("#send"), historyList = $("#history"), sidebar = $("#sidebar");

function save() {
  localStorage.setItem("tmd_messages", JSON.stringify(state.messages));
  localStorage.setItem("tmd_conversations", JSON.stringify(state.conversations));
}

function toast(t) {
  const x = $("#toast");
  x.textContent = t;
  x.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => x.classList.remove("show"), 2000);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function formatText(t) {
  let e = esc(t);
  // أكواد البرمجة
  e = e.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code.trim()}</code></pre>`);
  // أكواد داخل السطر
  e = e.replace(/`([^`]+)`/g, '<code>$1</code>');
  // الأسطر الجديدة
  return e.replace(/\n/g, '<br>');
}

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
      <div class="msg-avatar">${m.role === 'user' ? 'U' : 'T'}</div>
      <div class="msg-content">${formatText(m.content)}</div>
    `;
    chat.appendChild(div);
  });
  chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || state.busy) return;

  state.messages.push({ role: 'user', content: text });
  input.value = "";
  input.style.height = "auto";
  renderMessages();

  state.busy = true;
  send.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages, model: state.model })
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      state.messages.push({ role: 'assistant', content: data.reply });
    } else {
      toast(data.error || "حدث خطأ أثناء الاتصال.");
    }
  } catch (err) {
    toast("خطأ في الاتصال بالشبكة.");
  } finally {
    state.busy = false;
    send.disabled = false;
    save();
    renderMessages();
  }
}

// أحداث الواجهة
send.onclick = sendMessage;
input.onkeydown = e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

$("#newChat").onclick = () => {
  if (state.messages.length > 0) {
    state.conversations.unshift({ id: Date.now(), title: state.messages[0].content.slice(0, 25), messages: [...state.messages] });
    state.messages = [];
    save();
    renderMessages();
    toast("تم بدء محادثة جديدة");
  }
};

function applyTheme(v) {
  document.body.classList.toggle("light", v === "light");
  state.theme = v;
  localStorage.setItem("tmd_theme", v);
}

$("#themeTop").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
$("#openSidebar").onclick = () => sidebar.classList.add("open");
$("#closeSidebar").onclick = () => sidebar.classList.remove("open");
$("#settingsBtn").onclick = () => $("#modalBackdrop").classList.remove("hidden");
$("#modalClose").onclick = () => $("#modalBackdrop").classList.add("hidden");

applyTheme(state.theme);
renderMessages();
