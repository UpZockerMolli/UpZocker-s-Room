const socket = io();

// --- GLOBAL VARIABLES ---
let currentRoom = "Lobby";
let myName = "";
let localStream = null;
let globalScreenStream = null; 
let mediaRecorder;
let recordedChunks = [];
let peers = {};
let isAfk = false;
let typingTimeout = null;
let recStartTime, recTimerInterval;

// Config & Audio
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const chatSound = document.getElementById("chatSound");
chatSound.volume = 0.5;

// Emojis (Compact)
const emojiMap = {
    faces: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🧐","😎","🤩","😏","😒","😔","😟","😕","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","🤔","🤭","🤫","😶","😐","😑","😬","🙄","😯","😦","😮","😲","🥱","😴","🤤","😵","🥴","🤢","🤮","😷","🤒"],
    gestures: ["👋","🤚","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💪","💅","🤳"],
    tech: ["🎮","🕹️","👾","🤖","👽","🚀","🛸","🌌","💻","🖥️","⌨️","🖱️","📱","🔋","🔌","💾","💿","📀","🎥","🎬","🎧","🎤","📡","🔭","🔬","🧬","🧪","💊","💉"],
    animals: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🕷️","🦂","🐢","🐍","🦎","🦖","🦕"],
    misc: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","🔥","⚡","✨","🌟","💫","💥","💢","💦","💤","👀","🧠","💀","☠️"]
};

// --- MOBILE UI ---
document.getElementById("mobileMenuBtn").onclick = () => {
    document.getElementById("sidebar").classList.toggle("show");
    document.getElementById("chatSection").classList.remove("show");
};
document.getElementById("mobileChatBtn").onclick = () => {
    document.getElementById("chatSection").classList.add("show");
    document.getElementById("sidebar").classList.remove("show");
};
document.getElementById("closeChatMobile").onclick = () => {
    document.getElementById("chatSection").classList.remove("show");
};

// --- LOGIN SYSTEM ---
document.getElementById("loginBtn").onclick = performLogin;
document.getElementById("passwordInput").addEventListener("keypress", (e) => { if(e.key === "Enter") performLogin(); });

function performLogin() {
    myName = document.getElementById("usernameInput").value.trim();
    const pass = document.getElementById("passwordInput").value;
    if (myName && pass) socket.emit("login", { username: myName, password: pass });
    chatSound.play().then(() => chatSound.pause()).catch(() => {}); 
}

socket.on("login-success", () => {
    const login = document.getElementById("loginContainer");
    const boot = document.getElementById("bootOverlay");
    const app = document.getElementById("appContainer");
    const progress = document.querySelector(".boot-progress");

    login.classList.add("login-exit");

    setTimeout(() => {
        login.style.display = "none";
        boot.style.display = "flex"; 
        
        let width = 0;
        const interval = setInterval(() => {
            width += Math.random() * 15; 
            if (width >= 100) {
                width = 100;
                clearInterval(interval);
                setTimeout(() => {
                    boot.style.transition = "opacity 0.5s ease";
                    boot.style.opacity = "0";
                    setTimeout(() => {
                        boot.style.display = "none";
                        app.style.display = "flex";
                        app.classList.add("app-entering");
                        socket.emit("join", { room: "Lobby" });
                    }, 500);
                }, 300);
            }
            progress.style.width = width + "%";
        }, 100);
    }, 400); 
});

socket.on("login-error", msg => {
    document.getElementById("loginError").innerText = msg;
    showToast(msg, "error");
});

// --- ROOM MANAGEMENT (MODAL & LIST) ---
const modal = document.getElementById("customModal");
const modalInput = document.getElementById("newRoomInput");

document.getElementById("createRoomBtn").onclick = () => {
    modal.style.display = "flex";
    modalInput.value = "";
    modalInput.focus();
};
document.getElementById("cancelModalBtn").onclick = () => modal.style.display = "none";
modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

const createRoomAction = () => {
    const roomName = modalInput.value.trim();
    if (roomName) {
        socket.emit("create-room", roomName);
        modal.style.display = "none";
        showToast(`SECTOR CONSTRUCTED: [ ${roomName.toUpperCase()} ]`);
    }
};
document.getElementById("confirmModalBtn").onclick = createRoomAction;
modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createRoomAction();
    if (e.key === "Escape") modal.style.display = "none";
});

// Update Data (Rooms & Users)
socket.on("update-data", ({ rooms: roomList, users: userList }) => {
    // 1. Raumliste
    const rList = document.getElementById("roomList");
    rList.innerHTML = "";
    
    roomList.forEach(r => {
        const row = document.createElement("div");
        row.className = "room-row";

        const btn = document.createElement("button");
        btn.className = "room-btn"; 
        btn.innerText = r;
        if (r === currentRoom) btn.classList.add("active");
        btn.onclick = () => {
             if (r !== currentRoom) {
                 currentRoom = r;
                 roomStartTime = Date.now(); // <-- NEU: Timer resetten!
                 socket.emit("join", { room: r });
             }
        };
        row.appendChild(btn);

        if (r !== "Lobby") {
            const delBtn = document.createElement("button");
            delBtn.className = "delete-room-btn";
            delBtn.innerHTML = '<i class="fas fa-times"></i>'; 
            delBtn.title = "Close Sector";
            delBtn.onclick = (e) => {
                e.stopPropagation(); 
                socket.emit("delete-room", r);
                if(typeof clickSound !== "undefined") clickSound.cloneNode().play().catch(()=>{});
            };
            row.appendChild(delBtn);
        }
        rList.appendChild(row);
    });

    // 2. Userliste
    const uList = document.getElementById("userList");
    uList.innerHTML = "";
    userList.forEach(u => {
        const div = document.createElement("div");
        div.style.padding = "5px 0";
        div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        div.style.fontSize = "0.9em";
        const color = (u.username === myName) ? "#00f5ff" : "#e5e7eb";
        div.innerHTML = `<span style="color:${color}; font-weight:bold;">> ${u.username}</span> <span style="float:right; color:#666; font-size:0.8em;">[${u.room}]</span>`;
        uList.appendChild(div);
    });
});

socket.on("notify", msg => {
    showToast(msg);
    // Chat Log
    const b = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = "system-msg";
    div.innerText = msg;
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
});

socket.on("force-lobby", () => {
    if(currentRoom !== "Lobby") {
        currentRoom = "Lobby";
        socket.emit("join", { room: "Lobby" });
        showToast("SECTOR CLOSED - RELOCATING TO LOBBY", "error");
    }
});

// --- VIDEO & WEBRTC LOGIC ---
const startCamera = async () => { 
    try { 
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); 
        initVoiceCommands(); 
        
        const ph = document.getElementById("videoPlaceholder"); 
        if(ph) ph.remove(); 
        document.getElementById("videoControls").style.display = "flex"; 
        
        addVideoNode("local", myName, localStream, true); 
        socket.emit("ready-for-video"); 
    } catch(e) { 
        console.error(e); 
        showToast("UPLINK FAILED: ACCESS DENIED", "error"); 
    } 
};

document.getElementById("initVideoBtn").onclick = startCamera;

// Controls
document.getElementById("muteBtn").onclick = () => { 
    if(localStream) { 
        const t = localStream.getAudioTracks()[0]; 
        if(t) { t.enabled = !t.enabled; document.getElementById("muteBtn").classList.toggle("off", !t.enabled); } 
    } 
};
document.getElementById("cameraBtn").onclick = () => { 
    if(localStream) { 
        const t = localStream.getVideoTracks()[0]; 
        if(t) { t.enabled = !t.enabled; document.getElementById("cameraBtn").classList.toggle("off", !t.enabled); } 
    } 
};
document.getElementById("expandBtn").onclick = () => { 
    const s = document.getElementById("videoChatSection"); 
    !document.fullscreenElement ? s.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); 
};

// Screen Share (TOGGLE-FUNKTION)
let activeScreenTrack = null; // Speichert den aktuellen Screen-Share

document.getElementById("shareBtn").onclick = async () => { 
    
    // 1. PRÜFUNG: Teilen wir bereits den Bildschirm?
    if (activeScreenTrack && activeScreenTrack.readyState === "live") {
        // Manuell stoppen -> Löst automatisch die Rückkehr zur Webcam (onended) aus!
        activeScreenTrack.stop();
        activeScreenTrack.dispatchEvent(new Event('ended')); 
        return;
    }

    // 2. NORMALER START: Bildschirm auswählen
    try { 
        const s = await navigator.mediaDevices.getDisplayMedia({video:true}); 
        activeScreenTrack = s.getVideoTracks()[0]; 
        
        // Den Jungs das Bildschirm-Video schicken
        for(let i in peers){ 
            const se = peers[i].getSenders().find(x => x.track.kind === 'video'); 
            if(se) se.replaceTrack(activeScreenTrack); 
        } 
        
        // Dir selbst das Bildschirm-Video anzeigen
        document.querySelector("#v-local video").srcObject = s; 
        
        // 3. WENN BEENDET WIRD (Durch Klick auf den Button ODER die Windows-Leiste)
        activeScreenTrack.onended = () => { 
            const c = localStream.getVideoTracks()[0]; // Das ist deine normale Kamera
            
            // Den Jungs wieder die Kamera schicken
            for(let i in peers){ 
                const se = peers[i].getSenders().find(x => x.track.kind === 'video'); 
                if(se) se.replaceTrack(c); 
            } 
            
            // Dir selbst wieder die Kamera anzeigen
            document.querySelector("#v-local video").srcObject = localStream; 
            activeScreenTrack = null; // Reset
            
            if(typeof showToast === "function") showToast("SCREEN SHARE BEENDET - WEBCAM AKTIV");
        }; 
    } catch(e){
        console.error("Screen share abbruch:", e);
    } 
};

// PiP / Popout
document.getElementById("popoutBtn").onclick = async () => { 
    const c=document.getElementById("pipCanvas"), x=c.getContext("2d"), p=document.getElementById("pipVideo"); 
    p.srcObject=c.captureStream(); 
    p.onloadedmetadata=async()=>{try{await p.play();await p.requestPictureInPicture();}catch(e){}}; 
    setInterval(()=>{ 
        const v=Array.from(document.querySelectorAll("#videoGrid video")); 
        x.fillStyle="#05070d"; x.fillRect(0,0,c.width,c.height); 
        if(!v.length)return; 
        const r=v.length>3?2:1, co=Math.ceil(v.length/r), w=c.width/co, h=c.height/r; 
        v.forEach((el,i)=>{ drawCover(x,el,(i%co)*w,Math.floor(i/co)*h,w,h); }); 
    },100); 
};
function drawCover(ctx,img,x,y,w,h){
    if(!img.videoWidth)return;
    const iR=img.videoWidth/img.videoHeight,dR=w/h;
    let sx,sy,sw,sh;
    if(iR>dR){sw=img.videoHeight*dR;sh=img.videoHeight;sx=(img.videoWidth-sw)/2;sy=0;}
    else{sw=img.videoWidth;sh=img.videoWidth/dR;sx=0;sy=(img.videoHeight-sh)/2;}
    ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
}

// Add Video & Audio Mixer
function addVideoNode(id, name, stream, isLocal) {
    if (document.getElementById(`v-${id}`)) return;
    
    const wrap = document.createElement("div");
    wrap.id = `v-${id}`;
    wrap.className = "video-wrapper";
    
    const v = document.createElement("video");
    v.autoplay = true; v.playsinline = true;
    if (isLocal) v.muted = true; 
    v.srcObject = stream;
    
    const l = document.createElement("div");
    l.className = "label"; l.innerText = name;
    wrap.append(v, l);

    if (!isLocal) {
        const volBox = document.createElement("div");
        volBox.className = "volume-control";
        volBox.innerHTML = '<i class="fas fa-volume-up vol-icon"></i> <input type="range" min="0" max="1" step="0.1" value="1" class="vol-slider">';
        const slider = volBox.querySelector(".vol-slider");
        slider.oninput = (e) => {
            v.volume = e.target.value;
            volBox.querySelector("i").className = (v.volume == 0) ? "fas fa-volume-mute vol-icon" : "fas fa-volume-up vol-icon";
        };
        volBox.onclick = (e) => e.stopPropagation();
        wrap.appendChild(volBox);
    }

    document.getElementById("videoGrid").append(wrap);
    if (stream) setupVoice(stream, wrap);
    updateGridStyle();
}

function setupVoice(s,el){ 
    const c=new(window.AudioContext||window.webkitAudioContext)(), src=c.createMediaStreamSource(s), a=c.createAnalyser(); 
    a.fftSize=256; src.connect(a); 
    const d=new Uint8Array(a.frequencyBinCount); 
    const ch=()=>{
        a.getByteFrequencyData(d); 
        el.classList.toggle("speaking", (d.reduce((a,b)=>a+b)/d.length)>30); 
        requestAnimationFrame(ch);
    }; ch(); 
}

function updateGridStyle(){ 
    const c=document.querySelectorAll('.video-wrapper').length, g=document.getElementById("videoGrid"); 
    g.classList.remove('grid-mode-1','grid-mode-2','grid-mode-many'); 
    if(c===1)g.classList.add('grid-mode-1'); else if(c===2)g.classList.add('grid-mode-2'); else g.classList.add('grid-mode-many'); 
}

// --- AFK / CRYO SYSTEM ---
const originalStreams = {}; 

function createCryoStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360; 
    const ctx = canvas.getContext("2d");
    
    ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 8; ctx.strokeStyle = "#00f5ff"; ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#00f5ff"; ctx.font = "bold 40px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#00f5ff"; ctx.shadowBlur = 15;
    ctx.fillText("CRYO STASIS", canvas.width / 2, canvas.height / 2);
    
    ctx.font = "14px monospace"; ctx.fillStyle = "rgba(0, 245, 255, 0.7)"; ctx.shadowBlur = 0;
    ctx.fillText("PILOT OFFLINE", canvas.width / 2, canvas.height / 2 + 35);
    
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for(let i=0; i<canvas.height; i+=4) ctx.fillRect(0, i, canvas.width, 2);
    return canvas.captureStream(30);
}

function toggleAfkVisuals(id, isAfk) {
    const wrapper = document.getElementById(`v-${id}`);
    if (!wrapper) return;
    const video = wrapper.querySelector("video");

    if (isAfk) {
        wrapper.classList.add("cryo-active");
        if (!originalStreams[id]) originalStreams[id] = video.srcObject;
        
        const cryoStream = createCryoStream();
        if (originalStreams[id] && originalStreams[id].getAudioTracks().length > 0) {
            cryoStream.addTrack(originalStreams[id].getAudioTracks()[0]);
        }
        video.srcObject = cryoStream;
    } else {
        wrapper.classList.remove("cryo-active");
        if (originalStreams[id]) {
            video.srcObject = originalStreams[id];
            delete originalStreams[id];
        }
    }
}

document.getElementById("afkBtn").onclick = () => {
    if (!localStream) { showToast("ACTIVATE CAMERA FIRST!", "error"); return; }
    isAfk = !isAfk;
    const btn = document.getElementById("afkBtn");
    const audioTrack = localStream.getAudioTracks()[0];

    if (isAfk) {
        btn.classList.add("active");
        if(audioTrack) audioTrack.enabled = false;
        socket.emit("toggle-afk", true);
        toggleAfkVisuals("local", true);
    } else {
        btn.classList.remove("active");
        if(audioTrack) audioTrack.enabled = true;
        socket.emit("toggle-afk", false);
        toggleAfkVisuals("local", false);
    }
};

socket.on("user-afk", ({ id, isAfk }) => toggleAfkVisuals(id, isAfk));

// --- CHAT & FILE ---
const msgInput = document.getElementById("messageInput");
document.getElementById("sendBtn").onclick = () => {
    if (msgInput.value.trim()) { 
        socket.emit("chat-message", { text: msgInput.value }); 
        msgInput.value = ""; 
        socket.emit("stop-typing"); 
    }
};
msgInput.addEventListener("keypress", (e) => { if(e.key === "Enter") document.getElementById("sendBtn").click(); });

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
socket.on("user-stop-typing", () => document.getElementById("typingIndicator").classList.remove("active"));

document.getElementById("fileBtn").onclick = () => document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange = (e) => {
    const f = e.target.files[0];
    if (f) { 
        const r = new FileReader(); 
        r.onload = () => socket.emit("chat-message", { type: "file", data: r.result, fileName: f.name }); 
        r.readAsDataURL(f); 
    }
};

socket.on("chat-message", d => {
    const b = document.getElementById("chatBox");
    const isMe = d.user === myName;
    const div = document.createElement("div");
    div.className = `chat-msg ${isMe ? 'mine' : 'theirs'}`;
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const userColor = isMe ? 'neon-text-pink' : 'neon-text-cyan';
    
    let content = "";
    
    if (d.type === "file") {
        // --- NEU: Prüfen, ob die Datei ein Bild ist ---
        if (d.data.startsWith("data:image/")) {
            // Zeige es als klickbares Bild im Chat an (ruft jetzt openLightbox auf!)
            content = `
            <div class="chat-image-wrapper">
                <img src="${d.data}" class="chat-inline-img clickable" alt="${d.fileName}" onclick="openLightbox('${d.data}')" title="Großansicht">
                
                <a href="${d.data}" download="${d.fileName}" class="file-msg" style="font-size:0.8em; padding:3px; display:inline-block; margin-top: 5px;">
                    <i class="fas fa-file-download"></i> ${d.fileName} speichern
                </a>
            </div>`;
        } else {
            // Normaler Datei-Download für alles andere (z.B. PDFs, Zips)
            content = `<a href="${d.data}" download="${d.fileName}" class="file-msg"><i class="fas fa-file-download"></i> ${d.fileName}</a>`;
        }
    } else {
        content = d.text;
    }

    div.innerHTML = `<strong class="${userColor}">${d.user}</strong> <span class="chat-time">${time}</span><div style="margin-top:4px;">${content}</div>`;
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
    
    if (!isMe) { chatSound.currentTime = 0; chatSound.play().catch(()=>{}); }
});

// --- EMOJI & SOUNDBOARD ---
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const emojiGrid = document.getElementById("emojiGrid");
loadEmojis("faces");
emojiBtn.onclick = () => { emojiPicker.style.display = emojiPicker.style.display === "none" ? "flex" : "none"; };
document.querySelectorAll(".tab-btn").forEach(btn => { 
    btn.onclick = () => { 
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); 
        btn.classList.add("active"); 
        loadEmojis(btn.getAttribute("data-cat")); 
    }; 
});
function loadEmojis(cat) { 
    emojiGrid.innerHTML = ""; 
    (emojiMap[cat]||[]).forEach(e => { 
        const s=document.createElement("span"); s.innerText=e; s.className="emoji-item"; 
        s.onclick=()=>{msgInput.value+=e; msgInput.focus();}; 
        emojiGrid.appendChild(s); 
    }); 
}

const soundBtn = document.getElementById("soundBtn");
const soundBoard = document.getElementById("soundBoard");
soundBtn.onclick = () => { soundBoard.style.display = soundBoard.style.display === "none" ? "flex" : "none"; };
document.querySelectorAll(".sb-btn").forEach(btn => {
    btn.onclick = () => {
        const sid = btn.getAttribute("data-sound");
        playSoundLocal(sid);
        socket.emit("play-sound", sid);
    };
});
function playSoundLocal(sid) { const audio = document.getElementById(sid); if(audio) { audio.currentTime=0; audio.play().catch(()=>{}); } }
socket.on("play-sound", (sid) => playSoundLocal(sid));

document.addEventListener('click', (e) => {
    // Emojis schließen
    if (emojiPicker.style.display === "flex" && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
        emojiPicker.style.display = "none";
    }
    // Soundboard schließen
    if (soundBoard.style.display === "flex" && !soundBoard.contains(e.target) && !soundBtn.contains(e.target)) {
        soundBoard.style.display = "none";
    }
    // NEU: Config-Panel schließen
    const configBtn = document.getElementById("configBtn");
    if (configPanel.style.display === "block" && !configPanel.contains(e.target) && !configBtn.contains(e.target)) {
        configPanel.style.display = "none";
    }
});

// --- WEBRTC ---
socket.on("user-ready", ({ id, name }) => { const pc=new RTCPeerConnection(config); peers[id]=pc; localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); pc.onicecandidate=e=>e.candidate&&socket.emit("ice",{candidate:e.candidate,to:id}); addVideoNode(id,name,null,false); pc.ontrack=e=>{const v=document.querySelector(`#v-${id} video`);if(v)v.srcObject=e.streams[0];}; pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>socket.emit("offer",{offer:pc.localDescription,to:id,name:myName})); });
socket.on("offer", async d => { const pc=new RTCPeerConnection(config); peers[d.from]=pc; localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); pc.onicecandidate=e=>e.candidate&&socket.emit("ice",{candidate:e.candidate,to:d.from}); addVideoNode(d.from,d.name,null,false); pc.ontrack=e=>{const v=document.querySelector(`#v-${d.from} video`);if(v)v.srcObject=e.streams[0];}; await pc.setRemoteDescription(d.offer); const a=await pc.createAnswer(); await pc.setLocalDescription(a); socket.emit("answer",{answer:a,to:d.from}); });
socket.on("answer", d => peers[d.from]&&peers[d.from].setRemoteDescription(d.answer));
socket.on("ice", d => peers[d.from]&&peers[d.from].addIceCandidate(d.candidate));
socket.on("user-left", (id) => {
    const videoEl = document.getElementById(`v-${id}`);
    if (videoEl) videoEl.remove();
    if (peers[id]) { peers[id].close(); delete peers[id]; }
    updateGridStyle();
});

// --- DYNAMIC HOTKEY SYSTEM ---
const recBtn = document.getElementById("recordBtn");
const configPanel = document.getElementById("configPanel");
document.getElementById("configBtn").onclick = () => configPanel.style.display = configPanel.style.display === "none" ? "block" : "none";

// Definition aller Hotkeys und deren Ziel-Buttons
const hotkeys = {
    rec:    { id: "hotkeyRec",    btn: "recordBtn",  default: "",   current: "" },
    snap:   { id: "hotkeySnap",   btn: "snapBtn",    default: "",   current: "" },
    radio:  { id: "hotkeyRadio",  btn: "radioBtn",   default: "",   current: "" },
    afk:    { id: "hotkeyAfk",    btn: "afkBtn",     default: "",   current: "" },
    mute:   { id: "hotkeyMute",   btn: "muteBtn",    default: "",   current: "" },
    cam:    { id: "hotkeyCam",    btn: "cameraBtn",  default: "",   current: "" },
    share:  { id: "hotkeyShare",  btn: "shareBtn",   default: "",   current: "" },
    pip:    { id: "hotkeyPip",    btn: "popoutBtn",  default: "",   current: "" },
    expand: { id: "hotkeyExpand", btn: "expandBtn",  default: "",   current: "" }
};

// 1. Laden aus dem LocalStorage
Object.keys(hotkeys).forEach(key => {
    const stored = localStorage.getItem(`hotkey_${key}`);
    hotkeys[key].current = stored !== null ? stored : hotkeys[key].default;
    const inputEl = document.getElementById(hotkeys[key].id);
    if (inputEl) inputEl.value = hotkeys[key].current;
});

// 2. Eingabe-Logik für alle Input-Felder & Lösch-Buttons
document.querySelectorAll(".hotkey-capture").forEach(input => {
    // Tasten-Erfassung
    input.addEventListener("keydown", (e) => {
        e.preventDefault();
        // Tasten zum manuellen Löschen
        if (e.key === "Escape" || e.key === "Backspace" || e.key === "Delete") {
            input.value = "";
        } else {
            input.value = e.key;
        }
    });

    // --- NEU: Visueller Löschen-Button (Rotes X) ---
    const wrapper = input.parentElement;
    wrapper.style.display = "flex";
    wrapper.style.gap = "5px";
    input.style.flex = "1"; // Eingabefeld nimmt den restlichen Platz
    
    const clearBtn = document.createElement("button");
    clearBtn.type = "button"; 
    clearBtn.innerHTML = '<i class="fas fa-times"></i>';
    clearBtn.title = "Hotkey deaktivieren";
    
    // Cyberpunk Mülleimer-Styling (Direkt per JS injiziert)
    clearBtn.style.cssText = "background: rgba(255,0,0,0.1); border: 1px solid #550000; color: #ff0000; width: 45px; cursor: pointer; border-radius: 4px; transition: 0.2s; display: flex; justify-content: center; align-items: center; font-size: 1.1em;";
    
    // Hover-Effekte (leuchtet rot auf)
    clearBtn.onmouseover = () => { 
        clearBtn.style.background = "#ff0000"; 
        clearBtn.style.color = "#000"; 
        clearBtn.style.boxShadow = "0 0 10px #ff0000"; 
    };
    clearBtn.onmouseout = () => { 
        clearBtn.style.background = "rgba(255,0,0,0.1)"; 
        clearBtn.style.color = "#ff0000"; 
        clearBtn.style.boxShadow = "none"; 
    };
    
    // Klick-Logik zum Leeren
    clearBtn.onclick = () => {
        input.value = ""; // Feld leeren
    };
    
    wrapper.appendChild(clearBtn);
});

// 3. Speichern aller Hotkeys
document.getElementById("saveConfigBtn").onclick = () => {
    const electronKeys = {}; // Sammelt die Tasten für den Desktop-Client
    
    Object.keys(hotkeys).forEach(key => {
        const inputEl = document.getElementById(hotkeys[key].id);
        if (inputEl) {
            hotkeys[key].current = inputEl.value;
            localStorage.setItem(`hotkey_${key}`, hotkeys[key].current);
            electronKeys[key] = hotkeys[key].current;
        }
    });
    configPanel.style.display = "none";
    showToast("SYSTEM CONFIG UPDATED");

    // NEU: Wenn wir im Desktop-Client sind, schicke die Tasten an Windows!
    if (window.electronAPI) {
        window.electronAPI.updateHotkeys(electronKeys);
    }
};

// NEU: Initialer Brückenschlag zum Desktop-Client (direkt unter dem Save-Block einfügen)
if (window.electronAPI) {
    // Sende beim Laden direkt die gespeicherten Tasten an Windows
    const electronKeys = {};
    Object.keys(hotkeys).forEach(key => electronKeys[key] = hotkeys[key].current);
    window.electronAPI.updateHotkeys(electronKeys);

    // Höre auf globale Tastendrücke aus dem Windows-Hintergrund
    window.electronAPI.onHotkey((action) => {
        // Simuliere einfach einen physischen Klick auf den zugewiesenen Button
        const targetBtn = document.getElementById(hotkeys[action].btn);
        if (targetBtn) {
            targetBtn.click();
        }
    });
}

// 4. Globaler Listener (Führt die Aktionen aus)
document.addEventListener("keydown", (e) => {
    // Ignorieren, wenn wir im Chat tippen, einen Raum erstellen oder gerade einen Hotkey belegen
    if (["messageInput", "usernameInput", "passwordInput", "newRoomInput"].includes(document.activeElement.id) || 
        document.activeElement.classList.contains("hotkey-capture")) return;

    const pressedKey = e.key.toLowerCase();

    // Alle konfigurierten Hotkeys durchgehen
    Object.keys(hotkeys).forEach(key => {
        if (hotkeys[key].current && pressedKey === hotkeys[key].current.toLowerCase()) {
            e.preventDefault();

            // Sonderfall: Recording (braucht Uplink-Check)
            if (key === "rec") {
                if (globalScreenStream && globalScreenStream.active) {
                    toggleRecordingState();
                } else {
                    showToast("ERROR: UPLINK REQUIRED", "error");
                }
            } else {
                // Normaler Fall: Simuliere einen Mausklick auf den entsprechenden Button
                const targetBtn = document.getElementById(hotkeys[key].btn);
                if (targetBtn) targetBtn.click();
            }
        }
    });
});

recBtn.onclick = async () => {
    if (globalScreenStream && globalScreenStream.active) toggleRecordingState();
    else await initUplink();
};

async function initUplink() {
    try {
        globalScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { mediaSource: "screen", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });

        // UI Feedback (Gelb = Standby)
        recBtn.style.color = "#ffe600"; 
        recBtn.style.borderColor = "#ffe600"; 
        recBtn.style.boxShadow = "0 0 10px #ffe600";
        
        // REPARATUR: Statt 'playSound' nutzen wir direktes Audio
        new Audio("https://assets.mixkit.co/active_storage/sfx/972/972-preview.mp3").play().catch(()=>{});
        
        globalScreenStream.getVideoTracks()[0].onended = () => { resetRecordingUI(); globalScreenStream = null; };
    } catch (err) { 
        console.error("Uplink failed:", err); 
        if(typeof showToast === "function") showToast("UPLINK FAILED", "error");
    }
}

function toggleRecordingState() {
    if (recBtn.classList.contains("recording")) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    } else {
        startRecordingProcess();
    }
}

function startRecordingProcess() {
    if (!globalScreenStream) { showToast("ERROR: NO UPLINK FOR RECORDING", "error"); return; }
    recordedChunks = [];

    // Master-Mixer laden
    if (!globalAudioCtx) globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (globalAudioCtx.state === 'suspended') globalAudioCtx.resume();

    const dest = globalAudioCtx.createMediaStreamDestination();
    let hasAudio = false;

    // Spur 1: Spiel/System
    const screenAudioTracks = globalScreenStream.getAudioTracks();
    if (screenAudioTracks.length > 0) {
        const sysSource = globalAudioCtx.createMediaStreamSource(new MediaStream([screenAudioTracks[0]]));
        const sysGain = globalAudioCtx.createGain();
        sysGain.gain.value = 0.6; 
        sysSource.connect(sysGain);
        sysGain.connect(dest);
        hasAudio = true;
    }

    // Spur 2: Mikrofon (Egal ob gefiltert oder normal)
    if (localStream && localStream.getAudioTracks().length > 0) {
        const currentMicTrack = localStream.getAudioTracks()[0];
        if (currentMicTrack.readyState === 'live') {
            activeMicSource = globalAudioCtx.createMediaStreamSource(new MediaStream([currentMicTrack]));
            recMicGain = globalAudioCtx.createGain();
            recMicGain.gain.value = 2.0; 
            activeMicSource.connect(recMicGain);
            recMicGain.connect(dest);
            hasAudio = true;
        }
    }

    const tracks = [globalScreenStream.getVideoTracks()[0]];
    if (hasAudio) tracks.push(dest.stream.getAudioTracks()[0]);
    const combinedStream = new MediaStream(tracks);
    
    const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
                    ? { mimeType: 'video/webm;codecs=vp9,opus' } : { mimeType: 'video/webm' };

    try { 
        mediaRecorder = new MediaRecorder(combinedStream, options); 
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => { 
            saveFile(); 
            // WICHTIG: AudioCtx NICHT schließen, sonst stirbt der Radio-Filter!
            activeMicSource = null; 
            recMicGain = null; 
        };
        mediaRecorder.start(1000); 

        recBtn.classList.add("recording");
        recBtn.style.color = "#ff0000"; recBtn.style.borderColor = "#ff0000"; recBtn.style.boxShadow = "0 0 15px #ff0000";
        new Audio("https://assets.mixkit.co/active_storage/sfx/972/972-preview.mp3").play().catch(()=>{});
        showToast("MISSION LOG: RECORDING STARTED");
    } catch (err) { 
        console.error(err); showToast("ERROR: RECORDER FAILED", "error");
    }
}

    // --- KOMBINATION: Video + Mix-Audio ---
    const tracks = [globalScreenStream.getVideoTracks()[0]];
    if (hasAudio) {
        tracks.push(dest.stream.getAudioTracks()[0]);
    }

    const combinedStream = new MediaStream(tracks);
    
    // Beste verfügbare Qualität wählen
    const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
                    ? { mimeType: 'video/webm;codecs=vp9,opus' } 
                    : { mimeType: 'video/webm' };

    try { 
        mediaRecorder = new MediaRecorder(combinedStream, options); 
        
        mediaRecorder.ondataavailable = (e) => { 
            if (e.data.size > 0) recordedChunks.push(e.data); 
        };

        mediaRecorder.onstop = () => { 
            saveFile(); 
            audioCtx.close(); // Ressourcen freigeben
        };

        // Startet die Aufnahme (Datenpakete alle 1 Sekunde)
        mediaRecorder.start(1000); 

        // UI-Update
        recBtn.classList.add("recording");
        recBtn.style.color = "#ff0000"; // Leuchtend Rot während der Aufnahme
        recBtn.style.borderColor = "#ff0000";
        recBtn.style.boxShadow = "0 0 15px #ff0000";

        // Akustisches Feedback
        new Audio("https://assets.mixkit.co/active_storage/sfx/972/972-preview.mp3").play().catch(()=>{});
        showToast("MISSION LOG: RECORDING STARTED");

    } catch (err) { 
        console.error("MediaRecorder konnte nicht gestartet werden:", err);
        showToast("ERROR: RECORDER FAILED", "error");
    }

function saveFile() {
    resetRecordingUI();
    recBtn.style.color = "#ffe600"; recBtn.style.borderColor = "#ffe600"; recBtn.style.boxShadow = "0 0 10px #ffe600";
    new Audio("https://assets.mixkit.co/active_storage/sfx/2044/2044-preview.mp3").play().catch(()=>{});
    
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Mission-Log_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.webm`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
}

function resetRecordingUI() {
    recBtn.classList.remove("recording");
    recBtn.style = "";
}

// Media Session API (Background Hotkeys)
if ('mediaSession' in navigator) {
    const triggerRec = () => { if (globalScreenStream && globalScreenStream.active) toggleRecordingState(); };
    try {
        navigator.mediaSession.setActionHandler('play', triggerRec);
        navigator.mediaSession.setActionHandler('pause', triggerRec);
        navigator.mediaSession.setActionHandler('stop', triggerRec);
    } catch(e){}
}

// --- VOICE COMMAND SYSTEM (ROBUST) ---
let recognition; 
function initVoiceCommands() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognition) try { recognition.stop(); } catch(e){}
    
    recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.lang = 'de-DE'; 
    recognition.interimResults = false;

    recognition.onstart = () => console.log("🎤 Voice Command System: LISTENING");
    
    recognition.onend = () => {
        if (localStream) setTimeout(() => { try { recognition.start(); } catch(e){} }, 1000);
    };

    recognition.onresult = (e) => {
        const last = e.results.length - 1;
        const cmd = e.results[last][0].transcript.trim().toLowerCase();
        
        if (["messageInput", "usernameInput", "passwordInput"].includes(document.activeElement.id)) return;

        // Deutsch & Englisch Befehle
        if ((cmd.includes("aufnahme starten") || cmd.includes("system start") || cmd.includes("record start"))) {
            if(globalScreenStream && !recBtn.classList.contains("recording")) {
                toggleRecordingState();
                showToast("VOICE: RECORDING INITIATED");
            }
        }
        else if ((cmd.includes("aufnahme stoppen") || cmd.includes("system stop") || cmd.includes("record stop"))) {
            if(recBtn.classList.contains("recording")) {
                toggleRecordingState();
                showToast("VOICE: RECORDING STOPPED");
            }
        }
    };
    try { recognition.start(); } catch(e) {}
}

// --- HELPERS (TOASTS & UI SOUNDS) ---
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const iconClass = type === "error" ? "fa-exclamation-triangle" : "fa-check-circle";
    toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
    
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3");
    audio.volume = 0.2; audio.play().catch(()=>{});

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "fadeOutToast 0.5s forwards";
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

document.getElementById("inviteBtn").onclick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => showToast("COORDINATES COPIED TO CLIPBOARD"));
};

const clickSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
clickSound.volume = 0.1;
document.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) {
        const s = clickSound.cloneNode(); s.volume = 0.1; s.play().catch(()=>{});
    }
});

// --- UPGRADE: MILITARY RADIO FILTER (VOICE MODULATOR) ---
let isRadioActive = false;
let rawAudioTrack = null;
let radioAudioTrack = null;
let radioAudioCtx = null;
let activeMicSource = null;
let recMicGain = null;

// Helper: Erzeugt künstliche Verzerrung (Distortion)
function makeDistortionCurve(amount) {
    let k = typeof amount === 'number' ? amount : 50,
        n_samples = 44100, curve = new Float32Array(n_samples),
        deg = Math.PI / 180, i = 0, x;
    for ( ; i < n_samples; ++i ) {
        x = i * 2 / n_samples - 1;
        curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
    }
    return curve;
}

// Initialisiert den Filter (wird beim Kamera-Start gerufen)
function initRadioFilter() {
    if (!localStream || localStream.getAudioTracks().length === 0) return;
    rawAudioTrack = localStream.getAudioTracks()[0];
    
    // Master-Mixer nutzen oder erstellen
    if (!globalAudioCtx) globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (globalAudioCtx.state === 'suspended') globalAudioCtx.resume();

    const source = globalAudioCtx.createMediaStreamSource(new MediaStream([rawAudioTrack]));
    
    const bandpass = globalAudioCtx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1200;
    bandpass.Q.value = 1.0;

    const distortion = globalAudioCtx.createWaveShaper();
    distortion.curve = makeDistortionCurve(15);
    distortion.oversample = '4x';

    const gain = globalAudioCtx.createGain();
    gain.gain.value = 1.5;

    const dest = globalAudioCtx.createMediaStreamDestination();

    source.connect(bandpass);
    bandpass.connect(distortion);
    distortion.connect(gain);
    gain.connect(dest);

    radioAudioTrack = dest.stream.getAudioTracks()[0];
}

// Toggle-Logik
document.getElementById("radioBtn").onclick = () => {
    // Check, ob Uplink da ist
    if (!localStream || !localStream.getAudioTracks()[0]) {
        if(typeof showToast === "function") showToast("ACTIVATE CAMERA FIRST!", "error");
        return;
    }

    if (!radioAudioTrack) initRadioFilter();

    isRadioActive = !isRadioActive;
    document.getElementById("radioBtn").classList.toggle("active", isRadioActive);
    
    const trackToSend = isRadioActive ? radioAudioTrack : rawAudioTrack;

    // 1. Live-Stream für dich und die Peers updaten
    localStream.removeTrack(localStream.getAudioTracks()[0]);
    localStream.addTrack(trackToSend);

    for (let id in peers) {
        const sender = peers[id].getSenders().find(s => s.track.kind === 'audio');
        if (sender) sender.replaceTrack(trackToSend);
    }

    // 2. LIVE-UPDATE FÜR DIE AUFNAHME (Falls gerade eine läuft!)
    if (globalAudioCtx && activeMicSource && recMicGain && trackToSend.readyState === 'live') {
        activeMicSource.disconnect(); // Alte Spur abklemmen
        activeMicSource = globalAudioCtx.createMediaStreamSource(new MediaStream([trackToSend]));
        activeMicSource.connect(recMicGain); // Neue, gefilterte Spur live einklemmen
        console.log("Aufnahme-Mixer: Audio-Spur live gewechselt!");
    }

    const radioClick = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
    radioClick.volume = 0.5;
    radioClick.play().catch(()=>{});

    showToast(isRadioActive ? "COMMS: MILITARY RADIO ENABLED" : "COMMS: STANDARD AUDIO");
};

// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;
const installBtn = document.getElementById('installAppBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Verhindert, dass der Browser seinen eigenen kleinen Banner anzeigt
    e.preventDefault();
    // Speichert das Event für später
    deferredPrompt = e;
    // Zeigt deinen Cyberpunk-Download-Button an
    if (installBtn) installBtn.style.display = 'block';
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Zeigt den Installations-Dialog
        deferredPrompt.prompt();
        // Warte auf die Entscheidung des Nutzers
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // Prompt ist verbraucht
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });
}

// Prüfen, ob die App bereits installiert ist
window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    if (installBtn) installBtn.style.display = 'none';
    showToast("STATION APP INSTALLED SUCCESSFULLY");
});

// --- UPGRADE: MISSION CLOCK & TELEMETRY ---
let roomStartTime = Date.now();

// Uhr & Timer aktualisieren
setInterval(() => {
    const now = new Date();
    
    // 1. Lokale Uhrzeit (SYS.TIME)
    const timeStr = now.toLocaleTimeString('de-DE', { hour12: false });
    const localTimeEl = document.getElementById("localTimeDisplay");
    if (localTimeEl) localTimeEl.innerText = timeStr;

    // 2. Mission Uptime
    const diffSeconds = Math.floor((now - roomStartTime) / 1000);
    const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(diffSeconds % 60).padStart(2, '0');
    
    const uptimeEl = document.getElementById("uptimeDisplay");
    if (uptimeEl) uptimeEl.innerText = `${hrs}:${mins}:${secs}`;
}, 1000); // Jede Sekunde

// Uptime Resetten, wenn wir den Raum wechseln oder in die Lobby gezwungen werden
socket.on("join", () => { roomStartTime = Date.now(); });
socket.on("force-lobby", () => { roomStartTime = Date.now(); });

// --- UPGRADE: LIGHTBOX / IMAGE VIEWER ---
const lightbox = document.getElementById('imageLightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeLightboxBtn = document.querySelector('.close-lightbox');

// Funktion zum Öffnen (wird direkt im HTML-String des Chats aufgerufen)
// Wir machen sie global verfügbar (window.), damit der onclick-Handler im HTML sie findet.
window.openLightbox = (src) => {
    lightboxImg.src = src;
    lightbox.style.display = 'flex'; // Flex zentriert den Inhalt automatisch
};

// Schließen-Logik
if (closeLightboxBtn) {
    closeLightboxBtn.onclick = () => lightbox.style.display = 'none';
}

// Klick auf den dunklen Hintergrund schließt auch
lightbox.onclick = (e) => {
    // Nur schließen, wenn man auf den Hintergrund klickt, nicht auf das Bild selbst
    if (e.target === lightbox) lightbox.style.display = 'none';
};

// Escape-Taste schließt auch (Komfort-Funktion)
document.addEventListener('keydown', (e) => {
   if(e.key === "Escape" && lightbox.style.display === 'flex') {
       lightbox.style.display = 'none';
   }
});

// --- NEU: ORDNER-AUSWAHL LOGIK ---
const savePathInput = document.getElementById('savePathInput');
const selectFolderBtn = document.getElementById('selectFolderBtn');

// Pfad beim Start aus dem lokalen Speicher laden
const storedPath = localStorage.getItem('customSavePath');
if (storedPath && window.electronAPI) {
    if (savePathInput) savePathInput.value = storedPath;
    window.electronAPI.setSavePath(storedPath); // Dem Desktop-Client den Pfad übergeben
}

if (selectFolderBtn) {
    if (window.electronAPI) {
        selectFolderBtn.onclick = async () => {
            const path = await window.electronAPI.selectFolder();
            if (path) {
                savePathInput.value = path;
                localStorage.setItem('customSavePath', path);
                window.electronAPI.setSavePath(path);
                showToast("SPEICHERORT GEÄNDERT");
            }
        };
    } else {
        // Fallback für Nutzer, die nur im Browser sind
        selectFolderBtn.style.display = 'none';
        if (savePathInput) savePathInput.value = "Browser-Downloads (Nicht änderbar)";
    }
}

// --- NEU: SCREENSHOT LOGIK ---
const snapBtn = document.getElementById('snapBtn');
if (snapBtn) {
    snapBtn.onclick = () => {
        if (window.electronAPI) {
            window.electronAPI.takeScreenshot();
            // Blitzeffekt auf dem Bildschirm
            const flash = document.createElement('div');
            flash.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:white; z-index:9999; pointer-events:none; transition: opacity 0.3s ease; opacity: 0.8;";
            document.body.appendChild(flash);
            setTimeout(() => flash.style.opacity = "0", 50);
            setTimeout(() => flash.remove(), 300);
        } else {
            showToast("SCREENSHOTS NUR IM DESKTOP CLIENT VERFÜGBAR", "error");
        }
    };
}

// Hört auf die Bestätigung vom Desktop-Client, dass das Bild gespeichert wurde
if (window.electronAPI) {
    window.electronAPI.onNotify((msg) => {
        showToast(msg);
        new Audio("https://assets.mixkit.co/active_storage/sfx/2044/2044-preview.mp3").play().catch(()=>{});
    });
}