const socket = io();
let currentRoom = "Lobby", myName = "";
let localStream = null;
let peers = {};
const chatSound = document.getElementById("chatSound");
chatSound.volume = 0.5;

const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let typingTimeout = null;

const emojiMap = {
    faces: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑"],
    gestures: ["👋","🤚","Qw","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪"],
    tech: ["🎮","🕹️","👾","🤖","👽","🚀","🛸","🌌","💻","🖥️","⌨️","🖱️","📱","🔋","🔌","💾","💿","📀","🎥","🎬","🎧","🎤","📡","🔭","🔬","🧬","🧪","💊","💉"],
    animals: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","cow","🐷","🐽","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕"],
    misc: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🔥","⚡","✨","🌟","💫","💥","💢","💦","💧","💤","💨","👂","👀","🧠","🦴","🦷","💀","☠️"]
};

// --- MOBILE UI LOGIC ---
document.getElementById("mobileMenuBtn").onclick = () => {
    document.getElementById("sidebar").classList.toggle("show");
    document.getElementById("chatSection").classList.remove("show"); // Chat zu wenn Sidebar auf
};
document.getElementById("mobileChatBtn").onclick = () => {
    document.getElementById("chatSection").classList.add("show");
    document.getElementById("sidebar").classList.remove("show");
};
document.getElementById("closeChatMobile").onclick = () => {
    document.getElementById("chatSection").classList.remove("show");
};

// --- LOGIN ---
document.getElementById("loginBtn").onclick = () => {
    myName = document.getElementById("usernameInput").value.trim();
    const pass = document.getElementById("passwordInput").value;
    if (myName && pass) socket.emit("login", { username: myName, password: pass });
    chatSound.play().then(() => chatSound.pause()).catch(() => {}); 
};
document.getElementById("passwordInput").addEventListener("keypress", (e) => {
    if(e.key === "Enter") document.getElementById("loginBtn").click();
});
socket.on("login-success", () => {
    const login = document.getElementById("loginContainer");
    login.style.opacity = "0";
    login.style.transition = "opacity 0.5s";
    setTimeout(() => {
        login.style.display = "none";
        document.getElementById("appContainer").style.display = "flex";
        socket.emit("join", { room: "Lobby" });
    }, 500);
});
socket.on("login-error", msg => document.getElementById("loginError").innerText = msg);

// --- SIDEBAR & ROOMS ---
document.getElementById("createRoomBtn").onclick = () => {
    const newName = prompt("Name für den neuen Raum:");
    if (newName && newName.trim() !== "") socket.emit("create-room", newName.trim());
};
socket.on("update-data", ({ rooms, users }) => {
    const rList = document.getElementById("roomList"); rList.innerHTML = "";
    rooms.forEach(r => {
        const wrap = document.createElement("div"); wrap.className = "room-wrap";
        const rDiv = document.createElement("div");
        rDiv.className = "room-entry " + (r === currentRoom ? "active-room" : "standard-room");
        rDiv.innerHTML = `<span><i class="fas fa-hashtag"></i> ${r}</span>`;
        rDiv.onclick = () => switchRoom(r);
        if (r !== "Lobby") {
            const del = document.createElement("button"); del.innerHTML = '<i class="fas fa-times"></i>';
            del.className = "delete-room-btn";
            del.onclick = (e) => { e.stopPropagation(); socket.emit("delete-room", r); };
            rDiv.appendChild(del);
        }
        wrap.appendChild(rDiv);
        users.filter(u => u.room === r).forEach(u => {
            const uSub = document.createElement("div"); 
            uSub.className = "user-sub-entry"; uSub.innerHTML = `<i class="fas fa-circle" style="font-size:0.6em; margin-right:5px;"></i> ${u.username}`;
            wrap.appendChild(uSub);
        });
        rList.appendChild(wrap);
    });
    document.getElementById("userList").innerHTML = users.map(u => `
        <div class="user-entry">
            <span class="neon-text-cyan"><i class="fas fa-user-astronaut"></i> ${u.username}</span> 
            <span class="user-room-tag">${u.room}</span>
        </div>`).join("");
});
socket.on("notify", msg => {
    // Toast Notification
    const area = document.getElementById("notification-area");
    const n = document.createElement("div"); n.className = "notification-toast"; 
    n.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    area.appendChild(n); setTimeout(() => n.remove(), 4000);
    
    // System Message in Chat
    const b = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = "system-msg";
    div.innerText = msg;
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
});
socket.on("force-lobby", () => switchRoom("Lobby"));

// --- VIDEO LOGIC (Shortened where unchanged) ---
const startCamera = async () => { try { localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); const ph = document.getElementById("videoPlaceholder"); if(ph) ph.remove(); document.getElementById("videoControls").style.display = "flex"; addVideoNode("local", myName, localStream, true); socket.emit("ready-for-video"); } catch(e) { console.error(e); alert("Kamerafehler"); } };
function attachStartBtn() { const btn = document.getElementById("initVideoBtn"); if(btn) btn.onclick = startCamera; }
attachStartBtn();
document.getElementById("muteBtn").onclick = () => { if(localStream) { const t = localStream.getAudioTracks()[0]; if(t) { t.enabled = !t.enabled; document.getElementById("muteBtn").classList.toggle("off", !t.enabled); } } };
document.getElementById("cameraBtn").onclick = () => { if(localStream) { const t = localStream.getVideoTracks()[0]; if(t) { t.enabled = !t.enabled; document.getElementById("cameraBtn").classList.toggle("off", !t.enabled); } } };
document.getElementById("shareBtn").onclick = async () => { try { const s = await navigator.mediaDevices.getDisplayMedia({video:true}); const t = s.getVideoTracks()[0]; for(let i in peers){ const se = peers[i].getSenders().find(x=>x.track.kind==='video'); if(se) se.replaceTrack(t); } document.querySelector("#v-local video").srcObject=s; t.onended=()=>{ const c=localStream.getVideoTracks()[0]; for(let i in peers){ const se=peers[i].getSenders().find(x=>x.track.kind==='video'); if(se) se.replaceTrack(c); } document.querySelector("#v-local video").srcObject=localStream; }; } catch(e){} };
document.getElementById("popoutBtn").onclick = async () => { const c=document.getElementById("pipCanvas"), x=c.getContext("2d"), p=document.getElementById("pipVideo"); p.srcObject=c.captureStream(); p.onloadedmetadata=async()=>{try{await p.play();await p.requestPictureInPicture();}catch(e){}}; setInterval(()=>{ const v=Array.from(document.querySelectorAll("#videoGrid video")); x.fillStyle="#05070d"; x.fillRect(0,0,c.width,c.height); if(!v.length)return; const r=v.length>3?2:1, co=Math.ceil(v.length/r), w=c.width/co, h=c.height/r; v.forEach((el,i)=>{ drawCover(x,el,(i%co)*w,Math.floor(i/co)*h,w,h); }); },100); };
function drawCover(ctx,img,x,y,w,h){if(!img.videoWidth)return;const iR=img.videoWidth/img.videoHeight,dR=w/h;let sx,sy,sw,sh;if(iR>dR){sw=img.videoHeight*dR;sh=img.videoHeight;sx=(img.videoWidth-sw)/2;sy=0;}else{sw=img.videoWidth;sh=img.videoWidth/dR;sx=0;sy=(img.videoHeight-sh)/2;}ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);}
document.getElementById("expandBtn").onclick = () => { const s=document.getElementById("videoChatSection"); !document.fullscreenElement ? s.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); };
function addVideoNode(id, name, stream, isLocal) { if(document.getElementById("v-"+id))return; const w=document.createElement("div"); w.id="v-"+id; w.className="video-wrapper"; const v=document.createElement("video"); v.autoplay=true; v.playsinline=true; if(isLocal){v.muted=true;v.srcObject=stream;} const l=document.createElement("div"); l.className="label"; l.innerText=name; w.append(v,l); document.getElementById("videoGrid").append(w); if(stream) setupVoice(stream,w); updateGridStyle(); }
function setupVoice(s,el){ const c=new(window.AudioContext||window.webkitAudioContext)(), src=c.createMediaStreamSource(s), a=c.createAnalyser(); a.fftSize=256; src.connect(a); const d=new Uint8Array(a.frequencyBinCount); const ch=()=>{a.getByteFrequencyData(d); el.classList.toggle("speaking", (d.reduce((a,b)=>a+b)/d.length)>30); requestAnimationFrame(ch);}; ch(); }
function updateGridStyle(){ const c=document.querySelectorAll('.video-wrapper').length, g=document.getElementById("videoGrid"); g.classList.remove('grid-mode-1','grid-mode-2','grid-mode-many'); if(c===1)g.classList.add('grid-mode-1'); else if(c===2)g.classList.add('grid-mode-2'); else g.classList.add('grid-mode-many'); }
function switchRoom(n){ if(n===currentRoom)return; for(let i in peers)peers[i].close(); peers={}; document.getElementById("videoGrid").innerHTML=""; socket.emit("join",{room:n}); currentRoom=n; document.getElementById("sidebar").classList.remove("show"); /* Mobile sidebar close */ if(localStream){addVideoNode("local",myName,localStream,true);setTimeout(()=>socket.emit("ready-for-video"),500);}else{const p=document.createElement("div"); p.id="videoPlaceholder"; p.innerHTML='<button id="initVideoBtn" class="big-start-btn"><i class="fas fa-power-off"></i> Kamera-Uplink starten</button>'; document.getElementById("videoGrid").appendChild(p); attachStartBtn(); document.getElementById("videoGrid").className="";} }

// --- CHAT LOGIC ---
const msgInput = document.getElementById("messageInput");
document.getElementById("sendBtn").onclick = () => {
    if (msgInput.value.trim()) { 
        socket.emit("chat-message", { text: msgInput.value }); 
        msgInput.value = ""; 
        socket.emit("stop-typing"); // Stop typing sofort
    }
};
msgInput.addEventListener("keypress", (e) => {
    if(e.key === "Enter") document.getElementById("sendBtn").click();
});

// Typing Logic
msgInput.addEventListener("input", () => {
    socket.emit("typing");
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop-typing"), 2000);
});
socket.on("user-typing", (name) => {
    const ti = document.getElementById("typingIndicator");
    ti.innerText = `${name} schreibt...`;
    ti.classList.add("active");
});
socket.on("user-stop-typing", () => {
    document.getElementById("typingIndicator").classList.remove("active");
});

// Datei Upload
document.getElementById("fileBtn").onclick = () => document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange = (e) => {
    const f = e.target.files[0];
    if (f) { const r = new FileReader(); r.onload = () => socket.emit("chat-message", { type: "file", data: r.result, fileName: f.name }); r.readAsDataURL(f); }
};

// --- EMOJI PICKER ---
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const emojiGrid = document.getElementById("emojiGrid");
const tabBtns = document.querySelectorAll(".tab-btn");
loadEmojis("faces");
emojiBtn.onclick = () => { emojiPicker.style.display = emojiPicker.style.display === "none" ? "flex" : "none"; };
tabBtns.forEach(btn => { btn.onclick = () => { tabBtns.forEach(b => b.classList.remove("active")); btn.classList.add("active"); loadEmojis(btn.getAttribute("data-cat")); }; });
function loadEmojis(cat) { emojiGrid.innerHTML = ""; (emojiMap[cat]||[]).forEach(e => { const s=document.createElement("span"); s.innerText=e; s.className="emoji-item"; s.onclick=()=>{msgInput.value+=e; msgInput.focus();}; emojiGrid.appendChild(s); }); }

// --- SOUNDBOARD ---
const soundBtn = document.getElementById("soundBtn");
const soundBoard = document.getElementById("soundBoard");
soundBtn.onclick = () => { soundBoard.style.display = soundBoard.style.display === "none" ? "flex" : "none"; };

document.querySelectorAll(".sb-btn").forEach(btn => {
    btn.onclick = () => {
        const sid = btn.getAttribute("data-sound");
        playSoundLocal(sid); // Spiele für mich
        socket.emit("play-sound", sid); // Sende an andere
    };
});

function playSoundLocal(sid) {
    const audio = document.getElementById(sid);
    if(audio) { audio.currentTime=0; audio.play().catch(()=>{}); }
}

socket.on("play-sound", (sid) => playSoundLocal(sid));

// --- CLICK OUTSIDE TO CLOSE (Emojis & Soundboard) ---
document.addEventListener('click', (e) => {
    // Emojis schließen
    if (emojiPicker.style.display === "flex") {
        if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiPicker.style.display = "none";
        }
    }
    // Soundboard schließen
    if (soundBoard.style.display === "flex") {
        if (!soundBoard.contains(e.target) && !soundBtn.contains(e.target)) {
            soundBoard.style.display = "none";
        }
    }
});

// Chat Empfang
socket.on("chat-message", d => {
    const b = document.getElementById("chatBox");
    const isMe = d.user === myName;
    const div = document.createElement("div");
    div.className = `chat-msg ${isMe ? 'mine' : 'theirs'}`;
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const userColor = isMe ? 'neon-text-pink' : 'neon-text-cyan';
    let content = d.type === "file" ? `<a href="${d.data}" download="${d.fileName}" class="file-msg"><i class="fas fa-file-download"></i> ${d.fileName}</a>` : d.text;
    div.innerHTML = `<strong class="${userColor}">${d.user}</strong> <span class="chat-time">${time}</span><div style="margin-top:4px;">${content}</div>`;
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
    if (!isMe) { chatSound.currentTime = 0; chatSound.play().catch(()=>{}); }
});

// --- WEBRTC (Unverändert) ---
socket.on("user-ready", ({ id, name }) => { const pc=new RTCPeerConnection(config); peers[id]=pc; localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); pc.onicecandidate=e=>e.candidate&&socket.emit("ice",{candidate:e.candidate,to:id}); addVideoNode(id,name,null,false); pc.ontrack=e=>{const v=document.querySelector(`#v-${id} video`);if(v)v.srcObject=e.streams[0];}; pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>socket.emit("offer",{offer:pc.localDescription,to:id,name:myName})); });
socket.on("offer", async d => { const pc=new RTCPeerConnection(config); peers[d.from]=pc; localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); pc.onicecandidate=e=>e.candidate&&socket.emit("ice",{candidate:e.candidate,to:d.from}); addVideoNode(d.from,d.name,null,false); pc.ontrack=e=>{const v=document.querySelector(`#v-${d.from} video`);if(v)v.srcObject=e.streams[0];}; await pc.setRemoteDescription(d.offer); const a=await pc.createAnswer(); await pc.setLocalDescription(a); socket.emit("answer",{answer:a,to:d.from}); });
socket.on("answer", d => peers[d.from]&&peers[d.from].setRemoteDescription(d.answer));
socket.on("ice", d => peers[d.from]&&peers[d.from].addIceCandidate(d.candidate));