const state={messages:JSON.parse(localStorage.getItem("tmd_messages")||"[]"),busy:false};
const chat=document.getElementById("chat"),input=document.getElementById("input"),composer=document.getElementById("composer"),send=document.getElementById("send"),welcome=document.getElementById("welcome");
function save(){localStorage.setItem("tmd_messages",JSON.stringify(state.messages))}
function scrollBottom(){requestAnimationFrame(()=>chat.scrollTop=chat.scrollHeight)}
function addMessage(role,text,isError=false){const row=document.createElement("div");row.className=`message-row ${role}${isError?" error":""}`;const avatar=document.createElement("div");avatar.className="avatar";avatar.textContent=role==="user"?"أنت":"T";const bubble=document.createElement("div");bubble.className="bubble";bubble.textContent=text;if(role==="user")row.append(bubble,avatar);else row.append(avatar,bubble);chat.appendChild(row);scrollBottom();return row}
function render(){chat.querySelectorAll(".message-row").forEach(x=>x.remove());welcome.style.display=state.messages.length?"none":"grid";state.messages.forEach(m=>addMessage(m.role,m.content))}
function setBusy(v){state.busy=v;send.disabled=v;send.textContent=v?"…":"➤"}
async function sendMessage(text){const message=text.trim();if(!message||state.busy)return;state.messages.push({role:"user",content:message});save();render();input.value="";input.style.height="auto";setBusy(true);
const typing=document.createElement("div");typing.className="message-row assistant";typing.innerHTML='<div class="avatar">T</div><div class="bubble typing"><span></span><span></span><span></span></div>';chat.appendChild(typing);scrollBottom();
try{const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:state.messages})});const data=await r.json().catch(()=>({}));typing.remove();if(!r.ok||!data.ok)throw new Error(data.error||`HTTP ${r.status}`);state.messages.push({role:"assistant",content:data.message});save();render()}catch(e){typing.remove();addMessage("assistant",`حدث خطأ: ${e.message}`,true)}finally{setBusy(false);input.focus()}}
composer.addEventListener("submit",e=>{e.preventDefault();sendMessage(input.value)});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();composer.requestSubmit()}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,170)+"px"});
document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>{input.value=b.dataset.prompt;input.focus();input.dispatchEvent(new Event("input"))}));
document.getElementById("newChat").addEventListener("click",()=>{state.messages=[];save();render();input.focus()});
document.getElementById("clearChat").addEventListener("click",()=>{state.messages=[];save();render()});
document.getElementById("theme").addEventListener("click",()=>document.body.classList.toggle("light"));
render();
