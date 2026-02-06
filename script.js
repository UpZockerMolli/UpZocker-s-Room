const socket = io();
let currentRoom = "Lobby", myName = "";
let localStream = null;
let peers = {};
let isAfk = false;
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
// --- LOGIN SUCCESS ANIMATION SEQUENZ ---
socket.on("login-success", () => {
    const login = document.getElementById("loginContainer");
    const boot = document.getElementById("bootOverlay");
    const app = document.getElementById("appContainer");
    const progress = document.querySelector(".boot-progress");

    // 1. Login-Fenster Glitch-Effekt starten
    login.classList.add("login-exit");

    // Warte kurz, bis der Glitch fast vorbei ist (400ms)
    setTimeout(() => {
        login.style.display = "none";
        boot.style.display = "flex"; // Boot Screen zeigen
        
        // 2. Ladebalken simulieren
        let width = 0;
        // Intervall für den Balken (läuft ca. 1.5 Sekunden)
        const interval = setInterval(() => {
            // Zufällige Schritte für "echten" Look
            width += Math.random() * 15; 
            
            if (width >= 100) {
                width = 100;
                clearInterval(interval);
                
                // Wenn Balken voll: Boot Screen ausblenden
                setTimeout(() => {
                    boot.style.transition = "opacity 0.5s ease";
                    boot.style.opacity = "0";
                    
                    // 3. Haupt-App enthüllen
                    setTimeout(() => {
                        boot.style.display = "none";
                        app.style.display = "flex";
                        app.classList.add("app-entering"); // Zoom-Effekt starten
                        
                        // Jetzt erst dem Raum beitreten
                        socket.emit("join", { room: "Lobby" });
                    }, 500);
                }, 300);
            }
            progress.style.width = width + "%";
        }, 100); // Update alle 100ms

    }, 400); 
});
socket.on("login-error", msg => document.getElementById("loginError").innerText = msg);

// --- SIDEBAR & ROOMS ---
// --- CUSTOM ROOM CREATION MODAL ---
const modal = document.getElementById("customModal");
const modalInput = document.getElementById("newRoomInput");
const confirmBtn = document.getElementById("confirmModalBtn");
const cancelBtn = document.getElementById("cancelModalBtn");

// Öffnen des Modals
document.getElementById("createRoomBtn").onclick = () => {
    modal.style.display = "flex"; // Anzeigen
    modalInput.value = "";        // Feld leeren
    modalInput.focus();           // Cursor reinsetzen
};

// Schließen (Abbrechen)
cancelBtn.onclick = () => {
    modal.style.display = "none";
};

// Schließen (Klick auf Hintergrund)
modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
};

// Bestätigen (Raum erstellen)
const createRoomAction = () => {
    const roomName = modalInput.value.trim();
    if (roomName) {
        // NEU: Nur erstellen, nicht beitreten!
        socket.emit("create-room", roomName);
        
        modal.style.display = "none";
        
        if (typeof showToast === "function") {
            showToast(`SECTOR CONSTRUCTED: [ ${roomName.toUpperCase()} ]`);
        }
    }
};

// Klick auf Button
confirmBtn.onclick = createRoomAction;

// Enter-Taste im Eingabefeld
modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createRoomAction();
    if (e.key === "Escape") modal.style.display = "none";
});
socket.on("update-data", ({ rooms: roomList, users: userList }) => {
    // 1. RAUMLISTE RENDERN (Mit Lösch-Button)
    const rList = document.getElementById("roomList");
    rList.innerHTML = "";
    
    roomList.forEach(r => {
        // Container für die Zeile (Name + Delete Button)
        const row = document.createElement("div");
        row.className = "room-row";

        // Der "Beitreten"-Knopf
        const btn = document.createElement("button");
        btn.className = "room-btn"; 
        btn.innerText = r;
        if (r === currentRoom) btn.classList.add("active");
        
        btn.onclick = () => {
             if (r !== currentRoom) {
                 currentRoom = r;
                 socket.emit("join", { room: r });
             }
        };

        row.appendChild(btn);

        // Der "Löschen"-Knopf (Nur wenn nicht Lobby)
        if (r !== "Lobby") {
            const delBtn = document.createElement("button");
            delBtn.className = "delete-room-btn";
            delBtn.innerHTML = '<i class="fas fa-times"></i>'; 
            delBtn.title = "Close Sector";
            
            delBtn.onclick = (e) => {
                e.stopPropagation(); 
                
                // HIER GEÄNDERT: Sofortiger Befehl ohne Nachfrage
                socket.emit("delete-room", r);
                
                // Optional: Sound Feedback für den Klick
                if(typeof clickSound !== "undefined") {
                    clickSound.cloneNode().play().catch(()=>{});
                }
            };
            row.appendChild(delBtn);
        }
        rList.appendChild(row);
    });

    // 2. USERLISTE RENDERN (Auch hier machen wir es hübsch)
    const uList = document.getElementById("userList");
    uList.innerHTML = "";
    userList.forEach(u => {
        const div = document.createElement("div");
        div.style.padding = "5px 0";
        div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        div.style.fontSize = "0.9em";
        
        // Unterschiedliche Farben für mich und andere
        const color = (u.username === myName) ? "#00f5ff" : "#e5e7eb";
        
        div.innerHTML = `
            <span style="color:${color}; font-weight:bold;">> ${u.username}</span> 
            <span style="float:right; color:#666; font-size:0.8em;">[${u.room}]</span>
        `;
        uList.appendChild(div);
    });
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
const startCamera = async () => { try { localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); initVoiceCommands(); const ph = document.getElementById("videoPlaceholder"); if(ph) ph.remove(); document.getElementById("videoControls").style.display = "flex"; addVideoNode("local", myName, localStream, true); socket.emit("ready-for-video"); } catch(e) { console.error(e); if(typeof showToast === "function") showToast("UPLINK FAILED: ACCESS DENIED", "error"); } };
function attachStartBtn() { const btn = document.getElementById("initVideoBtn"); if(btn) btn.onclick = startCamera; }
attachStartBtn();
document.getElementById("muteBtn").onclick = () => { if(localStream) { const t = localStream.getAudioTracks()[0]; if(t) { t.enabled = !t.enabled; document.getElementById("muteBtn").classList.toggle("off", !t.enabled); } } };
document.getElementById("cameraBtn").onclick = () => { if(localStream) { const t = localStream.getVideoTracks()[0]; if(t) { t.enabled = !t.enabled; document.getElementById("cameraBtn").classList.toggle("off", !t.enabled); } } };
document.getElementById("shareBtn").onclick = async () => { try { const s = await navigator.mediaDevices.getDisplayMedia({video:true}); const t = s.getVideoTracks()[0]; for(let i in peers){ const se = peers[i].getSenders().find(x=>x.track.kind==='video'); if(se) se.replaceTrack(t); } document.querySelector("#v-local video").srcObject=s; t.onended=()=>{ const c=localStream.getVideoTracks()[0]; for(let i in peers){ const se=peers[i].getSenders().find(x=>x.track.kind==='video'); if(se) se.replaceTrack(c); } document.querySelector("#v-local video").srcObject=localStream; }; } catch(e){} };
document.getElementById("popoutBtn").onclick = async () => { const c=document.getElementById("pipCanvas"), x=c.getContext("2d"), p=document.getElementById("pipVideo"); p.srcObject=c.captureStream(); p.onloadedmetadata=async()=>{try{await p.play();await p.requestPictureInPicture();}catch(e){}}; setInterval(()=>{ const v=Array.from(document.querySelectorAll("#videoGrid video")); x.fillStyle="#05070d"; x.fillRect(0,0,c.width,c.height); if(!v.length)return; const r=v.length>3?2:1, co=Math.ceil(v.length/r), w=c.width/co, h=c.height/r; v.forEach((el,i)=>{ drawCover(x,el,(i%co)*w,Math.floor(i/co)*h,w,h); }); },100); };
function drawCover(ctx,img,x,y,w,h){if(!img.videoWidth)return;const iR=img.videoWidth/img.videoHeight,dR=w/h;let sx,sy,sw,sh;if(iR>dR){sw=img.videoHeight*dR;sh=img.videoHeight;sx=(img.videoWidth-sw)/2;sy=0;}else{sw=img.videoWidth;sh=img.videoWidth/dR;sx=0;sy=(img.videoHeight-sh)/2;}ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);}
document.getElementById("expandBtn").onclick = () => { const s=document.getElementById("videoChatSection"); !document.fullscreenElement ? s.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); };
function addVideoNode(id, name, stream, isLocal) {
    if (document.getElementById(`v-${id}`)) return;
    
    const wrap = document.createElement("div");
    wrap.id = `v-${id}`;
    wrap.className = "video-wrapper";
    
    const v = document.createElement("video");
    v.autoplay = true; v.playsinline = true;
    if (isLocal) v.muted = true; // Mich selbst immer muten
    v.srcObject = stream;
    
    // Name Label
    const l = document.createElement("div");
    l.className = "label"; l.innerText = name;
    
    wrap.append(v, l);

    // NEU: Audio Mixer (Nur für andere, nicht für mich selbst)
    if (!isLocal) {
        const volBox = document.createElement("div");
        volBox.className = "volume-control";
        volBox.innerHTML = '<i class="fas fa-volume-up vol-icon"></i> <input type="range" min="0" max="1" step="0.1" value="1" class="vol-slider">';
        
        // Event Listener für den Slider
        const slider = volBox.querySelector(".vol-slider");
        slider.oninput = (e) => {
            v.volume = e.target.value;
            // Icon ändern wenn stumm
            const icon = volBox.querySelector("i");
            if(v.volume == 0) icon.className = "fas fa-volume-mute vol-icon";
            else icon.className = "fas fa-volume-up vol-icon";
        };
        
        // Klick auf Slider soll nicht Bubblen (wichtig!)
        volBox.onclick = (e) => e.stopPropagation();
        
        wrap.appendChild(volBox);
    }

    document.getElementById("videoGrid").append(wrap);
    
    if (stream) setupVoice(stream, wrap);
    updateGridStyle();
}
function setupVoice(s,el){ const c=new(window.AudioContext||window.webkitAudioContext)(), src=c.createMediaStreamSource(s), a=c.createAnalyser(); a.fftSize=256; src.connect(a); const d=new Uint8Array(a.frequencyBinCount); const ch=()=>{a.getByteFrequencyData(d); el.classList.toggle("speaking", (d.reduce((a,b)=>a+b)/d.length)>30); requestAnimationFrame(ch);}; ch(); }
function updateGridStyle(){ const c=document.querySelectorAll('.video-wrapper').length, g=document.getElementById("videoGrid"); g.classList.remove('grid-mode-1','grid-mode-2','grid-mode-many'); if(c===1)g.classList.add('grid-mode-1'); else if(c===2)g.classList.add('grid-mode-2'); else g.classList.add('grid-mode-many'); }
function switchRoom(n){ if(n===currentRoom)return; for(let i in peers)peers[i].close(); peers={}; document.getElementById("videoGrid").innerHTML=""; socket.emit("join",{room:n}); currentRoom=n; document.getElementById("sidebar").classList.remove("show"); /* Mobile sidebar close */ if(localStream){addVideoNode("local",myName,localStream,true);setTimeout(()=>socket.emit("ready-for-video"),500);}else{const p=document.createElement("div"); p.id="videoPlaceholder"; p.innerHTML='<button id="initVideoBtn" class="big-start-btn"><i class="fas fa-power-off"></i> Kamera-Uplink starten</button>'; document.getElementById("videoGrid").appendChild(p); attachStartBtn(); document.getElementById("videoGrid").className="";} }
// --- AFK / CRYO STASIS (MIT PIP SUPPORT) ---
const originalStreams = {}; // Speicher für die echten Webcam-Streams

// Hilfsfunktion: Erzeugt ein Standbild (Angepasste Größe)
function createCryoStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360; // 16:9 Format
    const ctx = canvas.getContext("2d");
    
    // Hintergrund (Schwarz/Blau)
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dicker Rahmen außen
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#00f5ff";
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Text Styling (KLEINER GEMACHT)
    ctx.fillStyle = "#00f5ff";
    ctx.font = "bold 40px monospace"; // Vorher 60px
    ctx.textAlign = "center";
    ctx.textBaseline = "middle"; // Wichtig für exakte vertikale Mitte
    ctx.shadowColor = "#00f5ff";
    ctx.shadowBlur = 15;
    
    // Text zeichnen
    ctx.fillText("CRYO STASIS", canvas.width / 2, canvas.height / 2);
    
    // Optional: Kleinerer Subtext darunter für Cyberpunk-Feeling
    ctx.font = "14px monospace";
    ctx.fillStyle = "rgba(0, 245, 255, 0.7)";
    ctx.shadowBlur = 0;
    ctx.fillText("PILOT OFFLINE", canvas.width / 2, canvas.height / 2 + 35);

    // Scanlines Effekt
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for(let i=0; i<canvas.height; i+=4) ctx.fillRect(0, i, canvas.width, 2);

    return canvas.captureStream(30);
}

// Funktion zum Umschalten des Streams
function toggleAfkVisuals(id, isAfk) {
    const wrapper = document.getElementById(`v-${id}`);
    if (!wrapper) return;
    const video = wrapper.querySelector("video");

    if (isAfk) {
        // Style für das normale Fenster setzen
        wrapper.classList.add("cryo-active");
        
        // Original Stream sichern (falls noch nicht geschehen)
        if (!originalStreams[id]) {
            originalStreams[id] = video.srcObject;
        }
        
        // Stream gegen Cryo-Bild tauschen (Das sieht man dann im PiP!)
        const cryoStream = createCryoStream();
        // WICHTIG: Audio-Track vom Original behalten, sonst ist der User stumm (falls er nicht gemutet ist)
        if (originalStreams[id] && originalStreams[id].getAudioTracks().length > 0) {
            cryoStream.addTrack(originalStreams[id].getAudioTracks()[0]);
        }
        
        video.srcObject = cryoStream;
        
    } else {
        // Style entfernen
        wrapper.classList.remove("cryo-active");
        
        // Original Stream wiederherstellen
        if (originalStreams[id]) {
            video.srcObject = originalStreams[id];
            delete originalStreams[id]; // Speicher freigeben
        }
    }
}

// 1. Eigener Button Klick (AFK + Mute Logik)
document.getElementById("afkBtn").onclick = () => {
    // Sicherheitscheck: Haben wir überhaupt einen Stream?
    if (!localStream) {
        alert("Bitte erst 'ACTIVATE CAMERA' klicken!");
        return;
    }

    isAfk = !isAfk;
    const btn = document.getElementById("afkBtn");
    
    // Zugriff auf die Tonspur deines Mikrofons
    const audioTrack = localStream.getAudioTracks()[0];

    if (isAfk) {
        // --- CRYO AKTIVIEREN ---
        btn.classList.add("active");
        
        // 1. Mikrofon HARDWARE-SEITIG stummschalten
        if(audioTrack) audioTrack.enabled = false;
        
        // 2. Signal an Server senden
        socket.emit("toggle-afk", true);
        
        // 3. Optik ändern (Canvas Text anzeigen)
        toggleAfkVisuals("local", true);
        
    } else {
        // --- CRYO DEAKTIVIEREN ---
        btn.classList.remove("active");
        
        // 1. Mikrofon wieder einschalten
        if(audioTrack) audioTrack.enabled = true;
        
        // 2. Signal an Server senden
        socket.emit("toggle-afk", false);
        
        // 3. Optik zurücksetzen (Webcam anzeigen)
        toggleAfkVisuals("local", false);
    }
};

// 2. Signal von anderen empfangen
socket.on("user-afk", ({ id, isAfk }) => {
    toggleAfkVisuals(id, isAfk);
});

// Event vom Server empfangen (wenn jemand anderes AFK geht)
socket.on("user-afk", ({ id, isAfk }) => {
    const wrapper = document.getElementById(`v-${id}`);
    if (wrapper) {
        if (isAfk) {
            wrapper.classList.add("cryo-active");
        } else {
            wrapper.classList.remove("cryo-active");
        }
    }
});

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
// --- USER LEFT EVENT (Video entfernen) ---
socket.on("user-left", (id) => {
    // 1. Video Element aus dem DOM entfernen
    const videoEl = document.getElementById(`v-${id}`);
    if (videoEl) {
        videoEl.remove();
    }

    // 2. Peer Connection schließen
    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }

    // 3. Grid neu anordnen (damit keine Lücken bleiben)
    updateGridStyle();
});

// --- CONFIG & HOTKEYS ---
const configBtn = document.getElementById("configBtn");
const configPanel = document.getElementById("configPanel");
const hotkeyInput = document.getElementById("hotkeyInput");
const saveConfigBtn = document.getElementById("saveConfigBtn");

// Hotkey laden oder Standard "F9"
let currentHotkey = localStorage.getItem("recHotkey") || "F9";
hotkeyInput.value = currentHotkey;

configBtn.onclick = () => { configPanel.style.display = configPanel.style.display === "none" ? "block" : "none"; };

// Taste im Eingabefeld erfassen
hotkeyInput.addEventListener("keydown", (e) => { 
    e.preventDefault(); 
    // Speichere den sauberen Key-Namen (z.B. "F9", "p", " ")
    hotkeyInput.value = e.key; 
});

saveConfigBtn.onclick = () => {
    currentHotkey = hotkeyInput.value;
    localStorage.setItem("recHotkey", currentHotkey);
    configPanel.style.display = "none";
    showToast(`CONFIG UPDATED: [ ${currentHotkey} ]`);
};

// GLOBALER HOTKEY LISTENER
document.addEventListener("keydown", (e) => {
    // Ignorieren, wenn wir tippen
    if (["messageInput", "usernameInput", "passwordInput"].includes(document.activeElement.id)) return;

    // Vergleich der Taste
    if (e.key.toLowerCase() === currentHotkey.toLowerCase()) {
        e.preventDefault();
        
        // WICHTIG: Hotkey funktioniert nur, wenn der Uplink (Stream) schon steht!
        if (globalScreenStream && globalScreenStream.active) {
            toggleRecordingState();
        } else {
            // Visuelles Feedback, dass man erst klicken muss
            showToast("ERROR: UPLINK REQUIRED", "error");
        }
    }
});


// --- MISSION LOG (STANDBY & RECORDING) ---
let mediaRecorder;
let recordedChunks = [];
let globalScreenStream = null; 
const recBtn = document.getElementById("recordBtn");

// Klick-Logik: Unterscheidet zwischen Init und Aufnahme
recBtn.onclick = async () => {
    // 1. Wenn wir schon einen Stream haben -> Aufnahme starten/stoppen
    if (globalScreenStream && globalScreenStream.active) {
        toggleRecordingState();
        return;
    }

    // 2. Wenn noch kein Stream da ist -> Initialisieren (Standby Modus)
    await initUplink();
};

// Schritt 1: Uplink herstellen (Wird GELB)
async function initUplink() {
    try {
        globalScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                mediaSource: "screen",
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 60 }
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        // UI auf GELB (Ready / Standby) setzen
        recBtn.style.color = "#ffe600"; 
        recBtn.style.borderColor = "#ffe600";
        recBtn.style.boxShadow = "0 0 10px #ffe600";
        
        // Sound Feedback (Online)
        playSound("sfx1"); // Kurzes Signal (optional)

        // Cleanup Handler
        globalScreenStream.getVideoTracks()[0].onended = () => {
            resetRecordingUI();
            globalScreenStream = null;
        };

    } catch (err) {
        console.error("Uplink failed:", err);
    }
}

// Schritt 2: Aufnahme umschalten (Rot <-> Gelb)
function toggleRecordingState() {
    // STOPPEN
    if (recBtn.classList.contains("recording")) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        return;
    }

    // STARTEN
    startRecordingProcess();
}

function startRecordingProcess() {
    if (!globalScreenStream) return;

    recordedChunks = [];
    
    // --- AUDIO MIXER (MIT VERSTÄRKUNG) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();

    // 1. SYSTEM AUDIO (Spielsound) - Etwas leiser machen
    if (globalScreenStream.getAudioTracks().length > 0) {
        const sysAudioStream = new MediaStream(globalScreenStream.getAudioTracks());
        const sysSource = audioCtx.createMediaStreamSource(sysAudioStream);
        
        // System Gain (Lautstärke)
        const sysGain = audioCtx.createGain();
        sysGain.gain.value = 0.7; // 0.7 = 70% Lautstärke (damit es die Stimme nicht übertönt)
        
        sysSource.connect(sysGain);
        sysGain.connect(dest);
    }

    // 2. MIKROFON AUDIO - Deutlich lauter machen!
    if (localStream && localStream.getAudioTracks().length > 0) {
        const micSource = audioCtx.createMediaStreamSource(localStream);
        
        // Mikrofon Gain (Verstärker)
        const micGain = audioCtx.createGain();
        // HIER ANPASSEN: 1.0 = Normal, 3.0 = 3-fach, 5.0 = 5-fach
        micGain.gain.value = 5.0; 
        
        micSource.connect(micGain);
        micGain.connect(dest);
    } else {
        console.warn("Kein Mikrofon gefunden.");
    }

    // 3. Finaler Stream
    const mixedAudioTrack = dest.stream.getAudioTracks()[0];
    const videoTrack = globalScreenStream.getVideoTracks()[0];
    const combinedStream = new MediaStream([videoTrack, mixedAudioTrack]);

    // -----------------------------------

    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    
    try {
        mediaRecorder = new MediaRecorder(combinedStream, options);
    } catch (e) {
        mediaRecorder = new MediaRecorder(combinedStream);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        saveFile();
        audioCtx.close(); 
    };

    mediaRecorder.start();
    
    // UI Update
    recBtn.classList.add("recording");
    recBtn.style.color = ""; 
    recBtn.style.borderColor = ""; 
    recBtn.style.boxShadow = "";
    
    // Start Sound
    const beep = new Audio("https://assets.mixkit.co/active_storage/sfx/972/972-preview.mp3"); 
    beep.volume = 0.2; beep.play().catch(()=>{});
}

function saveFile() {
    // UI zurück auf GELB (Standby)
    recBtn.classList.remove("recording");
    recBtn.style.color = "#ffe600"; 
    recBtn.style.borderColor = "#ffe600";
    recBtn.style.boxShadow = "0 0 10px #ffe600";

    // Sound Feedback (Stop/Save - Win)
    const beep = new Audio("https://assets.mixkit.co/active_storage/sfx/2044/2044-preview.mp3"); 
    beep.volume = 0.2; beep.play().catch(()=>{});

    // Datei speichern
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `Mission-Log_${timestamp}.webm`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => { 
        document.body.removeChild(a); 
        window.URL.revokeObjectURL(url); 
    }, 100);
}

function resetRecordingUI() {
    recBtn.classList.remove("recording");
    recBtn.style.color = ""; 
    recBtn.style.borderColor = "";
    recBtn.style.boxShadow = "";
}

// Click Outside für Config Panel
document.addEventListener("click", (e) => {
    if (configPanel && configPanel.style.display === "block" && !configPanel.contains(e.target) && !configBtn.contains(e.target)) {
        configPanel.style.display = "none";
    }
});

// --- BACKGROUND HOTKEY HACK (MEDIA SESSION API) ---

if ('mediaSession' in navigator) {
    // Wir sagen dem Browser: "Wir sind ein Media-Player"
    navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Mission Log Uplink',
        artist: 'UpZocker Station',
        album: 'Secure Connection',
        artwork: [
            { src: 'favicon.png', sizes: '96x96', type: 'image/png' },
            { src: 'favicon.png', sizes: '128x128', type: 'image/png' },
        ]
    });

    // Wir kapern die "Play" und "Pause" Taste der Tastatur
    const triggerRecFromBackground = () => {
        // Sound abspielen, damit man im Spiel hört, dass es geklappt hat
        const sfx = new Audio(recBtn.classList.contains("recording") 
            ? "https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3" // Stop Sound
            : "https://assets.mixkit.co/active_storage/sfx/972/972-preview.mp3" // Start Sound
        );
        sfx.volume = 0.5;
        sfx.play();

        // Die eigentliche Funktion aufrufen
        if (globalScreenStream && globalScreenStream.active) {
            toggleRecordingState();
        }
    };

    try {
        navigator.mediaSession.setActionHandler('play', triggerRecFromBackground);
        navigator.mediaSession.setActionHandler('pause', triggerRecFromBackground);
        // Manche Tastaturen senden "stop", das fangen wir auch ab
        navigator.mediaSession.setActionHandler('stop', triggerRecFromBackground); 
    } catch (e) {
        console.log("Media Session API warning:", e);
    }
}

// --- VOICE COMMANDS (ROBUST RESTART) ---
let recognition; 

function initVoiceCommands() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return; // Browser kann das nicht

    // Falls schon eine Instanz läuft -> Stoppen um Konflikte zu vermeiden
    if (recognition) {
        try { recognition.stop(); } catch(e){}
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;  // Zuhören nicht aufhören
    recognition.lang = 'de-DE';     // Sprache
    recognition.interimResults = false;

    recognition.onstart = () => {
        console.log("🎤 Voice Command System: LISTENING");
    };

    recognition.onerror = (event) => {
        console.warn("Voice Error:", event.error);
    };

    recognition.onend = () => {
        // Wenn die Kamera noch läuft -> Sofort neu starten!
        if (localStream) {
            console.log("Voice Service paused. Restarting...");
            setTimeout(() => { 
                try { recognition.start(); } catch(e){} 
            }, 1000);
        }
    };

    recognition.onresult = (e) => {
        const last = e.results.length - 1;
        const cmd = e.results[last][0].transcript.trim().toLowerCase();
        console.log("Befehl erkannt:", cmd); // Debugging im Log

        // Befehle filtern
        if (["messageInput", "usernameInput", "passwordInput"].includes(document.activeElement.id)) return;

        // --- COMMAND LIST ---
        if ((cmd.includes("Aufnahme starten") || cmd.includes("record start"))) {
            // Nur starten, wenn Screen-Sharing da ist und wir nicht schon aufnehmen
            if(globalScreenStream && !recBtn.classList.contains("recording")) {
                toggleRecordingState();
                if(typeof showToast === "function") showToast("VOICE: RECORDING INITIATED");
            }
        }
        else if ((cmd.includes("Aufnahme stoppen") || cmd.includes("record stop"))) {
            if(recBtn.classList.contains("recording")) {
                toggleRecordingState();
                if(typeof showToast === "function") showToast("VOICE: RECORDING STOPPED");
            }
        }
    };

    // ZÜNDUNG
    try { recognition.start(); } catch(e) {}
}

// Funktion zum Ausführen
function triggerVoiceAction(shouldRecord) {
    // Sicherheitscheck: Ist Uplink da?
    if (!globalScreenStream || !globalScreenStream.active) {
        // Falls nicht, versuchen wir ihn wiederherzustellen oder warnen akustisch
        const errorSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2606/2606-preview.mp3"); // Fail Sound
        errorSound.volume = 0.3; errorSound.play().catch(()=>{});
        console.log("Command rejected: No Uplink");
        return;
    }

    const isRecording = recBtn.classList.contains("recording");

    if (shouldRecord && !isRecording) {
        // STARTEN
        toggleRecordingState();
    } else if (!shouldRecord && isRecording) {
        // STOPPEN
        toggleRecordingState();
    }
}

// --- INVITE SYSTEM ---
document.getElementById("inviteBtn").onclick = () => {
    // Nimmt die aktuelle URL aus dem Browser
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
        showToast("COORDINATES COPIED TO CLIPBOARD");
    });
};

// --- TACTICAL TOAST SYSTEM ---
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    
    // Element erstellen
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    // Icon wählen
    const iconClass = type === "error" ? "fa-exclamation-triangle" : "fa-check-circle";
    
    toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
    
    // Sound abspielen (kurzer System-Beep)
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3");
    audio.volume = 0.2;
    audio.play().catch(()=>{});

    container.appendChild(toast);

    // Nach 4 Sekunden entfernen
    setTimeout(() => {
        toast.style.animation = "fadeOutToast 0.5s forwards";
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// --- GLOBAL UI SOUNDS ---
// Ein kurzer, dezenter Klick-Sound
const clickSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
clickSound.volume = 0.1; // Sehr leise, nur unbewusst wahrnehmbar

// Fügt den Sound zu ALLEN Buttons hinzu (automatisch)
document.addEventListener("click", (e) => {
    // Prüfen, ob das geklickte Element (oder sein Elternteil) ein Button ist
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) {
        // Sound klonen, damit er sich überlappen kann (schnelles Klicken)
        const soundClone = clickSound.cloneNode();
        soundClone.volume = 0.1;
        soundClone.play().catch(()=>{});
    }
});