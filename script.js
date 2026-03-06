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
let globalAudioCtx = null;
let activeMicSource = null;
let recMicGain = null;

// Spracherkennung
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = SpeechRecognition ? new SpeechRecognition() : null; 

// Config & Audio
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const chatSound = document.getElementById("chatSound");
chatSound.volume = 0.5;

// Emojis
const emojiMap = {
    faces: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🧐","😎","🤩","😏","😒","😔","😟","😕","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","🤔","🤭","🤫","😶","😐","😑","😬","🙄","😯","😦","😮","😲","🥱","😴","🤤","😵","🥴","🤢","🤮","😷","🤒"],
    gestures: ["👋","🤚","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💪","💅","🤳"],
    tech: ["🎮","🕹️","👾","🤖","👽","🚀","🛸","🌌","💻","🖥️","⌨️","🖱️","📱","🔋","🔌","💾","💿","📀","🎥","🎬","🎧","🎤","📡","🔭","🔬","🧬","🧪","💊","💉"],
    animals: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🕷️","🦂","🐢","🐍","🦎","🦖","🦕"],
    misc: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","🔥","⚡","✨","🌟","💫","💥","💢","💦","💤","👀","🧠","💀","☠️"]
};

// ============================================================
// --- REPARATUR-BLOCK: UI & CHAT (Slide-In & Single-Send) ---
// ============================================================

// 1. Sidebar & Chat UI Steuerung
const sidebar = document.getElementById("sidebar");
const chatSection = document.getElementById("chatSection");
const desktopChatToggle = document.getElementById("desktopChatToggle");
const notificationBadge = document.getElementById("chatNotificationBadge");

// Desktop: Sidebar Slide-In
if (desktopChatToggle) {
    desktopChatToggle.onclick = () => {
        chatSection.classList.toggle("chat-open");
        // Badge ausblenden, wenn Chat geöffnet wird
        if (chatSection.classList.contains("chat-open") && notificationBadge) {
            notificationBadge.style.display = "none";
        }
    };
}

// Mobile: Menü öffnen
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
if (mobileMenuBtn) {
    mobileMenuBtn.onclick = () => {
        sidebar.classList.toggle("show");
        chatSection.classList.remove("chat-open"); 
    };
}

// Mobile: Chat öffnen
const mobileChatBtn = document.getElementById("mobileChatBtn");
if (mobileChatBtn) {
    mobileChatBtn.onclick = () => {
        chatSection.classList.add("chat-open");
        sidebar.classList.remove("show");
    };
}

// Mobile: Chat schließen
const closeChatMobile = document.getElementById("closeChatMobile");
if (closeChatMobile) {
    closeChatMobile.onclick = () => {
        chatSection.classList.remove("chat-open");
    };
}

// 2. Chat Logik (Senden & Empfangen)
const msgInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const fileBtn = document.getElementById("fileBtn");

// Zentrale Sende-Funktion (verhindert doppelten Code)
function performChatSend() {
    if (!msgInput) return;
    const text = msgInput.value.trim();
    if (text) {
        socket.emit("chat-message", { type: "text", text: text });
        msgInput.value = "";
        socket.emit("stop-typing");
    }
}

// Event Listener nur setzen, wenn das Element existiert
if (sendBtn) {
    // Vorherigen Listener entfernen (Trick gegen Doppel-Senden)
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.onclick = performChatSend;
}

if (msgInput) {
    // Enter-Taste
    msgInput.onkeypress = (e) => {
        if (e.key === "Enter") performChatSend();
    };
    
    // Typing Indicator
    msgInput.oninput = () => {
        socket.emit("typing");
        if (typeof typingTimeout !== 'undefined') clearTimeout(typingTimeout);
        // Globale Variable typingTimeout muss existieren, sonst hier 'let' nutzen
        typingTimeout = setTimeout(() => socket.emit("stop-typing"), 2000);
    };
}

// Datei-Versand
if (fileBtn) {
    fileBtn.onclick = () => {
        if(fileInput) fileInput.click();
    };
}

if (fileInput) {
    // Alten Listener entfernen
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    newFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Optional: Größenlimit 50MB
        if (file.size > 50 * 1024 * 1024) {
            if(typeof showToast === "function") showToast("DATEI ZU GROSS (MAX 50MB)", "error");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            socket.emit("chat-message", { 
                type: "file", 
                data: reader.result, 
                fileName: file.name 
            });
            if(typeof showToast === "function") showToast("DATEI WIRD GESENDET...");
        };
        reader.readAsDataURL(file);
        newFileInput.value = ""; // Reset
    };
}

// 3. Nachrichten Empfangen
// WICHTIG: Prüfen ob wir den Listener schon haben, sonst feuert er doppelt!
if (!socket.hasListeners("chat-message")) {
    socket.on("chat-message", (d) => {
        const chatBox = document.getElementById("chatBox");
        if (!chatBox) return;

        const isMe = d.user === myName;
        const div = document.createElement("div");
        div.className = `chat-msg ${isMe ? 'mine' : 'theirs'}`;
        
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        // Farben basierend auf User (Neon Pink für mich, Cyan für andere)
        const userColor = isMe ? 'neon-text-pink' : 'neon-text-cyan';
        
        let content = "";
        
        if (d.type === "file") {
            // Check ob Bild
            if (d.data && d.data.startsWith("data:image/")) {
                content = `
                <div class="chat-image-wrapper">
                    <img src="${d.data}" class="chat-inline-img clickable" onclick="openLightbox('${d.data}')" style="max-width: 200px; border-radius: 8px; cursor: pointer;">
                    <br>
                    <a href="${d.data}" download="${d.fileName}" class="file-msg"><i class="fas fa-download"></i> ${d.fileName}</a>
                </div>`;
            } else {
                content = `<a href="${d.data}" download="${d.fileName}" class="file-msg"><i class="fas fa-file-alt"></i> ${d.fileName}</a>`;
            }
        } else {
            content = d.text; // Normaler Text
        }

        div.innerHTML = `
            <strong class="${userColor}">${d.user}</strong> 
            <span class="chat-time" style="font-size: 0.8em; opacity: 0.7;">${time}</span>
            <div style="margin-top: 4px;">${content}</div>
        `;

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;

        // Sound & Notification
        if (!isMe) {
            if (typeof chatSound !== 'undefined' && chatSound) { 
                chatSound.currentTime = 0; 
                chatSound.play().catch(()=>{}); 
            }
            // Badge Logik
            if (!chatSection.classList.contains("chat-open")) {
                if (notificationBadge) notificationBadge.style.display = "block";
            }
        }
    });
}
// ============================================================

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
        
        getConnectedDevices(); 
        
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

// --- ROOM MANAGEMENT & CLEANUP ---
const modal = document.getElementById("customModal");
const modalInput = document.getElementById("newRoomInput");

function resetVideoState() {
    Object.keys(peers).forEach(id => {
        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }
    });
    peers = {};
    const allVideos = document.querySelectorAll('.video-wrapper');
    allVideos.forEach(wrap => {
        if (wrap.id !== 'v-local') {
            wrap.remove();
        }
    });
    updateGridStyle();
}

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

socket.on("update-data", ({ rooms: roomList, users: userList }) => {
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
                 resetVideoState();
                 currentRoom = r;
                 roomStartTime = Date.now();
                 socket.emit("join", { room: r });
                 
                 if (localStream) {
                     setTimeout(() => {
                         socket.emit("ready-for-video");
                     }, 100);
                 }
                 
                 showToast(`ENTERING SECTOR: ${r.toUpperCase()}`);
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
    const b = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = "system-msg";
    div.innerText = msg;
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
});

socket.on("force-lobby", () => {
    if(currentRoom !== "Lobby") {
        resetVideoState();
        currentRoom = "Lobby";
        socket.emit("join", { room: "Lobby" });
        if(localStream) setTimeout(() => socket.emit("ready-for-video"), 100);
        showToast("SECTOR CLOSED - RELOCATING TO LOBBY", "error");
    }
});

// --- HARDWARE & VIDEO LOGIC ---

async function getConnectedDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoSelect = document.getElementById('cameraSelect');
        const audioSelect = document.getElementById('micSelect');
        const speakerSelect = document.getElementById('speakerSelect');

        if(videoSelect) videoSelect.innerHTML = '<option value="">Standard Kamera</option>'; 
        if(audioSelect) audioSelect.innerHTML = '<option value="">Standard Mikrofon</option>';
        if(speakerSelect) speakerSelect.innerHTML = '<option value="">System Standard</option>';

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} (${device.deviceId.slice(0,5)}...)`;

            if (device.kind === 'videoinput' && videoSelect) videoSelect.appendChild(option);
            else if (device.kind === 'audioinput' && audioSelect) audioSelect.appendChild(option);
            else if (device.kind === 'audiooutput' && speakerSelect) speakerSelect.appendChild(option);
        });

        const savedCam = localStorage.getItem('selectedCamId');
        const savedMic = localStorage.getItem('selectedMicId');
        const savedSpeaker = localStorage.getItem('selectedSpeakerId');

        if (savedCam && videoSelect) videoSelect.value = savedCam;
        if (savedMic && audioSelect) audioSelect.value = savedMic;
        if (savedSpeaker && speakerSelect) speakerSelect.value = savedSpeaker;
    } catch(e) { console.warn("Device enum error:", e); }
}

const startCamera = async () => { 
    try { 
        const videoSelect = document.getElementById('cameraSelect');
        const audioSelect = document.getElementById('micSelect');
        
        const videoSource = (videoSelect && videoSelect.value) ? videoSelect.value : undefined;
        const audioSource = (audioSelect && audioSelect.value) ? audioSelect.value : undefined;

        const constraints = {
            video: videoSource ? { deviceId: { exact: videoSource } } : true,
            audio: audioSource ? { deviceId: { exact: audioSource } } : true
        };

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        localStream = await navigator.mediaDevices.getUserMedia(constraints); 
        
        initVoiceCommands(); 
        
        const ph = document.getElementById("videoPlaceholder"); 
        if(ph) ph.remove(); 
        document.getElementById("videoControls").style.display = "flex"; 
        
        // Video-Element aktualisieren
        let myVideoWrap = document.getElementById("v-local");
        if (!myVideoWrap) {
            addVideoNode("local", myName, localStream, true);
        } else {
            const v = myVideoWrap.querySelector("video");
            v.srcObject = localStream;
            setupVoice(localStream, myVideoWrap);
            
            // --- NEU: Spiegel wieder aktivieren (Webcam Modus) ---
            myVideoWrap.classList.add("self-mirror");
        }

        Object.values(peers).forEach(pc => {
            const senders = pc.getSenders();
            localStream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track.kind === track.kind);
                if (sender) sender.replaceTrack(track);
            });
        });

        socket.emit("ready-for-video"); 
        
        localStorage.setItem('selectedCamId', videoSource || "");
        localStorage.setItem('selectedMicId', audioSource || "");
        getConnectedDevices();

    } catch(e) { 
        console.error(e); 
        showToast("UPLINK FAILED: " + e.message, "error"); 
    } 
};

const camSel = document.getElementById('cameraSelect');
if(camSel) camSel.onchange = () => { if(localStream) startCamera(); };

const micSel = document.getElementById('micSelect');
if(micSel) micSel.onchange = () => { if(localStream) startCamera(); };

const spkSel = document.getElementById('speakerSelect');
if(spkSel) spkSel.onchange = async (e) => {
    const deviceId = e.target.value;
    localStorage.setItem('selectedSpeakerId', deviceId);
    
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
        if (typeof v.setSinkId === 'function') {
            try { await v.setSinkId(deviceId); } catch(err) {}
        }
    }
    const audios = document.querySelectorAll('audio');
    for (const a of audios) {
        if (typeof a.setSinkId === 'function') {
            try { await a.setSinkId(deviceId); } catch(err) {}
        }
    }
};

document.getElementById("initVideoBtn").onclick = startCamera;

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

// --- CHAT & FILE SEND LOGIC ---

// 1. fileInput and fileBtn already defined above at line 101-102

// 2. Nachrichten senden (Button Klick)
if (sendBtn) {
    sendBtn.onclick = () => {
        const text = msgInput.value.trim();
        if (text) {
            socket.emit("chat-message", { type: "text", text: text });
            msgInput.value = "";
            socket.emit("stop-typing");
        }
    };
}

// 3. Nachrichten senden (Enter Taste)
if (msgInput) {
    msgInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendBtn.click();
        }
    });

    // Typing Indicator
    msgInput.addEventListener("input", () => {
        socket.emit("typing");
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit("stop-typing"), 2000);
    });
}

// 4. Dateien/Bilder senden
if (fileBtn) {
    fileBtn.onclick = () => fileInput.click();
}

if (fileInput) {
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Dateigröße checken (optional, z.B. max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showToast("DATEI ZU GROSS (MAX 5MB)", "error");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            socket.emit("chat-message", { 
                type: "file", 
                data: reader.result, 
                fileName: file.name 
            });
            showToast("DATEI WIRD GESENDET...");
        };
        reader.readAsDataURL(file);
        
        // Input resetten, damit man die gleiche Datei nochmal wählen könnte
        fileInput.value = ""; 
    };
}

// --- CONTROLS ---
const expandBtn = document.getElementById("expandBtn");
expandBtn.onclick = () => { 
    const s = document.getElementById("videoChatSection"); 
    !document.fullscreenElement ? s.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); 
};
document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
        expandBtn.classList.add("active");
        expandBtn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
        expandBtn.classList.remove("active");
        expandBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
});

// --- SCREEN SHARE (MIT ANTI-SPIEGEL FIX) ---
let activeScreenTrack = null; 
const shareBtn = document.getElementById("shareBtn");

shareBtn.onclick = async () => { 
    if (activeScreenTrack && activeScreenTrack.readyState === "live") {
        activeScreenTrack.stop();
        activeScreenTrack.dispatchEvent(new Event('ended')); 
        return;
    }
    try { 
        const s = await navigator.mediaDevices.getDisplayMedia({video:true}); 
        activeScreenTrack = s.getVideoTracks()[0]; 
        shareBtn.classList.add("active");
        
        // --- NEU: Spiegelung ausschalten für Screen Share ---
        const localWrap = document.getElementById("v-local");
        if(localWrap) localWrap.classList.remove("self-mirror");

        for(let i in peers){ 
            const se = peers[i].getSenders().find(x => x.track.kind === 'video'); 
            if(se) se.replaceTrack(activeScreenTrack); 
        } 
        
        document.querySelector("#v-local video").srcObject = s; 
        
        activeScreenTrack.onended = () => { 
            const c = localStream.getVideoTracks()[0]; 
            for(let i in peers){ 
                const se = peers[i].getSenders().find(x => x.track.kind === 'video'); 
                if(se) se.replaceTrack(c); 
            } 
            document.querySelector("#v-local video").srcObject = localStream; 
            activeScreenTrack = null; 
            shareBtn.classList.remove("active");
            
            // --- NEU: Spiegelung wieder einschalten (Webcam zurück) ---
            if(localWrap) localWrap.classList.add("self-mirror");

            if(typeof showToast === "function") showToast("SCREEN SHARE BEENDET - WEBCAM AKTIV");
        }; 
    } catch(e){
        console.error("Screen share abbruch:", e);
        shareBtn.classList.remove("active");
        // Falls Fehler, Spiegelung sicherheitshalber wieder an
        const localWrap = document.getElementById("v-local");
        if(localWrap) localWrap.classList.add("self-mirror");
    } 
};

// --- FIX: PIP / POPOUT (NO DISTORTION / SMART CROP) ---
let pipInterval = null;
const popoutBtn = document.getElementById("popoutBtn");
popoutBtn.onclick = async () => { 
    const c = document.getElementById("pipCanvas");
    const ctx = c.getContext("2d");
    const p = document.getElementById("pipVideo"); 
    
    popoutBtn.classList.add("active");

    // Standard HD
    c.width = 1280; 
    c.height = 720;
    
    // Canvas leeren
    ctx.fillStyle = "#05070d"; 
    ctx.fillRect(0, 0, c.width, c.height); 
    
    p.srcObject = c.captureStream(30); 
    p.muted = true; 
    
    if (pipInterval) clearInterval(pipInterval);
    pipInterval = setInterval(() => {
        const v = Array.from(document.querySelectorAll("#videoGrid video")); 
        
        ctx.fillStyle = "#05070d"; 
        ctx.fillRect(0, 0, c.width, c.height); 
        
        if (v.length > 0) { 
            // 1. Grid Berechnung (Spalten & Zeilen)
            const rows = v.length > 3 ? 2 : 1; 
            const cols = Math.ceil(v.length / rows);
            
            // Größe eines einzelnen Slots
            const slotW = c.width / cols; 
            const slotH = c.height / rows; 

            v.forEach((el, i) => { 
                if (el.videoWidth === 0 || el.videoHeight === 0) return; // Noch nicht bereit

                try {
                    // Position im Grid
                    const dx = (i % cols) * slotW;
                    const dy = Math.floor(i / cols) * slotH;

                    // --- SMART CROP LOGIK (Object-Fit: Cover) ---
                    const vw = el.videoWidth;
                    const vh = el.videoHeight;
                    
                    const imgRatio = vw / vh;
                    const slotRatio = slotW / slotH;

                    let sx, sy, sWidth, sHeight;

                    if (imgRatio > slotRatio) {
                        // Bild ist breiter als der Slot -> Seiten abschneiden
                        sHeight = vh;
                        sWidth = vh * slotRatio;
                        sy = 0;
                        sx = (vw - sWidth) / 2;
                    } else {
                        // Bild ist höher als der Slot -> Oben/Unten abschneiden
                        sWidth = vw;
                        sHeight = vw / slotRatio;
                        sx = 0;
                        sy = (vh - sHeight) / 2;
                    }

                    // Zeichnen mit Crop
                    ctx.drawImage(el, sx, sy, sWidth, sHeight, dx, dy, slotW, slotH);

                } catch(err) {
                    // Falls Video kurzzeitig nicht verfügbar ist
                } 
            }); 
        }
    }, 33);
    
    try { 
        await p.play(); 
        await p.requestPictureInPicture(); 
    } catch(e) { 
        console.error("PiP Fehler:", e); 
        popoutBtn.classList.remove("active"); 
    }
    
    p.onleavepictureinpicture = () => { 
        clearInterval(pipInterval); 
        popoutBtn.classList.remove("active"); 
    };
};

// --- VIDEO HELPER ---
// --- VIDEO HELPER (MIT INTELLIGENTER LAUTSTÄRKE-STEUERUNG) ---
function addVideoNode(id, name, stream, isLocal) {
    if (document.getElementById(`v-${id}`)) return;
    
    const wrap = document.createElement("div");
    wrap.id = `v-${id}`;
    wrap.className = "video-wrapper";
    
    // Spiegeln NUR wenn es mein eigenes Video ist
    if (isLocal) {
        wrap.classList.add("self-mirror");
    }
    
    const v = document.createElement("video");
    v.autoplay = true; 
    v.playsinline = true;
    if (isLocal) v.muted = true; 
    v.srcObject = stream;
    
    const l = document.createElement("div");
    l.className = "label"; 
    l.innerText = name;
    wrap.append(v, l);

    // Lautstärkeregler nur für ANDERE (nicht für mich selbst)
    if (!isLocal) {
        const volBox = document.createElement("div");
        volBox.className = "volume-control";
        
        // Icon und Slider HTML
        volBox.innerHTML = `
            <i class="fas fa-volume-up vol-icon" title="Mute/Unmute"></i> 
            <input type="range" min="0" max="1" step="0.05" value="1" class="vol-slider" title="Lautstärke">
        `;
        
        const icon = volBox.querySelector(".vol-icon");
        const slider = volBox.querySelector(".vol-slider");
        let lastVolume = 1; // Speichert die Lautstärke vor dem Muten

        // Funktion zum Aktualisieren des Icons basierend auf dem Wert
        const updateIconState = (val) => {
            if (val == 0) {
                icon.className = "fas fa-volume-mute vol-icon";
                icon.style.color = "var(--neon-pink)"; // Rot wenn stumm
            } else if (val < 0.5) {
                icon.className = "fas fa-volume-down vol-icon";
                icon.style.color = "var(--neon-cyan)";
            } else {
                icon.className = "fas fa-volume-up vol-icon";
                icon.style.color = "var(--neon-cyan)";
            }
        };

        // 1. Slider Logik
        slider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            v.volume = val;
            if (val > 0) lastVolume = val; // Merken, falls wir nicht auf 0 sind
            updateIconState(val);
        };

        // 2. Click-to-Mute Logik
        icon.onclick = (e) => {
            e.stopPropagation(); // Verhindert Klicks auf das Video dahinter
            
            if (v.volume > 0) {
                // STUMM SCHALTEN
                lastVolume = v.volume; // Aktuellen Wert sichern
                v.volume = 0;
                slider.value = 0;
            } else {
                // WIEDER EINSCHALTEN (Unmute)
                v.volume = lastVolume || 1; // Alten Wert oder 100% nehmen
                slider.value = v.volume;
            }
            updateIconState(v.volume);
        };

        // Verhindert, dass Klicks auf den Slider das Overlay schließen o.ä.
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

// --- AFK & CHAT LOGIC ---
const originalStreams = {}; 
function createCryoStream() {
    const canvas = document.createElement("canvas"); 
    canvas.width = 640; 
    canvas.height = 360; 
    const ctx = canvas.getContext("2d");
    
    // Hintergrund
    ctx.fillStyle = "#05070d"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Rahmen
    ctx.lineWidth = 8; 
    ctx.strokeStyle = "#00f5ff"; 
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Text: AFK (Groß und mittig)
    ctx.fillStyle = "#00f5ff"; 
    ctx.font = "bold 80px monospace"; // Größere Schrift für das kurze Wort
    ctx.textAlign = "center"; 
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#00f5ff"; 
    ctx.shadowBlur = 20;
    ctx.fillText("AFK", canvas.width / 2, canvas.height / 2 - 20);
    
    // Subtext (Optional, kann auch weg)
    ctx.font = "20px monospace"; 
    ctx.fillStyle = "rgba(0, 245, 255, 0.7)"; 
    ctx.shadowBlur = 0;
    ctx.fillText("USER ABWESEND", canvas.width / 2, canvas.height / 2 + 40);
    
    // Scanlines Effekt
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
        if (originalStreams[id] && originalStreams[id].getAudioTracks().length > 0) cryoStream.addTrack(originalStreams[id].getAudioTracks()[0]);
        video.srcObject = cryoStream;
    } else {
        wrapper.classList.remove("cryo-active");
        if (originalStreams[id]) { video.srcObject = originalStreams[id]; delete originalStreams[id]; }
    }
}

document.getElementById("afkBtn").onclick = () => {
    if (!localStream) { showToast("ACTIVATE CAMERA FIRST!", "error"); return; }
    isAfk = !isAfk;
    const btn = document.getElementById("afkBtn");
    const audioTrack = localStream.getAudioTracks()[0];
    if (isAfk) {
        btn.classList.add("active"); if(audioTrack) audioTrack.enabled = false;
        socket.emit("toggle-afk", true); toggleAfkVisuals("local", true);
    } else {
        btn.classList.remove("active"); if(audioTrack) audioTrack.enabled = true;
        socket.emit("toggle-afk", false); toggleAfkVisuals("local", false);
    }
};
socket.on("user-afk", ({ id, isAfk }) => toggleAfkVisuals(id, isAfk));

// --- WEBRTC CORE (SAFE MODE) ---

socket.on("user-ready", ({ id, name }) => {
    const pc = new RTCPeerConnection(config);
    peers[id] = pc;

    // SICHERHEITS-CHECK: Nur Senden, wenn Kamera an ist
    if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = e => e.candidate && socket.emit("ice", { candidate: e.candidate, to: id });
    
    pc.ontrack = e => {
        const v = document.querySelector(`#v-${id} video`);
        if (v) v.srcObject = e.streams[0];
    };

    addVideoNode(id, name, null, false);

    pc.createOffer()
        .then(o => pc.setLocalDescription(o))
        .then(() => socket.emit("offer", { offer: pc.localDescription, to: id, name: myName }));
});

socket.on("offer", async d => {
    const pc = new RTCPeerConnection(config);
    peers[d.from] = pc;

    // SICHERHEITS-CHECK: Nur Senden, wenn Kamera an ist
    if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = e => e.candidate && socket.emit("ice", { candidate: e.candidate, to: d.from });
    
    pc.ontrack = e => {
        const v = document.querySelector(`#v-${d.from} video`);
        if (v) v.srcObject = e.streams[0];
    };

    addVideoNode(d.from, d.name, null, false);

    await pc.setRemoteDescription(d.offer);
    const a = await pc.createAnswer();
    await pc.setLocalDescription(a);
    socket.emit("answer", { answer: a, to: d.from });
});

socket.on("answer", d => {
    if (peers[d.from]) peers[d.from].setRemoteDescription(d.answer);
});

socket.on("ice", d => {
    if (peers[d.from]) peers[d.from].addIceCandidate(d.candidate);
});

socket.on("user-left", (id) => {
    const videoEl = document.getElementById(`v-${id}`);
    if (videoEl) videoEl.remove();
    if (peers[id]) { 
        peers[id].close(); 
        delete peers[id]; 
    }
    updateGridStyle();
});

// --- HOTKEYS & CONFIG ---
const recBtn = document.getElementById("recordBtn");
const configPanel = document.getElementById("configPanel");
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

function toggleElectronHotkeys(enable) {
    if (!window.electronAPI) return;
    if (enable) { const electronKeys = {}; Object.keys(hotkeys).forEach(key => electronKeys[key] = hotkeys[key].current); window.electronAPI.updateHotkeys(electronKeys); } 
    else { window.electronAPI.updateHotkeys({}); }
}

document.getElementById("configBtn").onclick = async () => {
    const isOpening = configPanel.style.display === "none";
    configPanel.style.display = isOpening ? "flex" : "none"; 
    toggleElectronHotkeys(!isOpening);
    if (isOpening) {
        try { await navigator.mediaDevices.getUserMedia({audio: true, video: true}); } catch(e){}
        await getConnectedDevices();
    }
};
document.getElementById("closeConfigBtn").onclick = () => { configPanel.style.display = "none"; toggleElectronHotkeys(true); }

Object.keys(hotkeys).forEach(key => {
    let stored = localStorage.getItem(`hotkey_${key}`);
    if (stored === "null" || stored === null) stored = ""; 
    hotkeys[key].current = stored !== "" ? stored : hotkeys[key].default;
    const inputEl = document.getElementById(hotkeys[key].id);
    if (inputEl) inputEl.value = hotkeys[key].current;
});

document.querySelectorAll(".hotkey-capture").forEach(input => {
    input.addEventListener("keydown", (e) => {
        e.preventDefault();
        if (e.key === "Escape" || e.key === "Backspace" || e.key === "Delete") { input.value = ""; } else { input.value = e.key; }
    });
    const wrapper = input.parentElement; wrapper.style.display = "flex"; wrapper.style.gap = "5px"; input.style.flex = "1"; 
    if (!wrapper.querySelector('.clear-hotkey-btn')) {
        const clearBtn = document.createElement("button"); clearBtn.type = "button"; clearBtn.className = "clear-hotkey-btn"; clearBtn.innerHTML = '<i class="fas fa-times"></i>';
        clearBtn.style.cssText = "background: rgba(255,0,0,0.1); border: 1px solid #550000; color: #ff0000; width: 30px; cursor: pointer; border-radius: 4px; transition: 0.2s;";
        clearBtn.onclick = () => { input.value = ""; }; wrapper.appendChild(clearBtn);
    }
});

const saveBtn = document.getElementById("saveConfigBtn");
if (saveBtn) {
    saveBtn.onclick = (e) => {
        e.preventDefault(); 
        Object.keys(hotkeys).forEach(key => {
            const inputEl = document.getElementById(hotkeys[key].id);
            if (inputEl) { hotkeys[key].current = inputEl.value; localStorage.setItem(`hotkey_${key}`, hotkeys[key].current); }
        });
        const videoSelect = document.getElementById('cameraSelect');
        const audioSelect = document.getElementById('micSelect');
        const speakerSelect = document.getElementById('speakerSelect');
        if(videoSelect) localStorage.setItem('selectedCamId', videoSelect.value);
        if(audioSelect) localStorage.setItem('selectedMicId', audioSelect.value);
        if(speakerSelect) localStorage.setItem('selectedSpeakerId', speakerSelect.value);
        if (configPanel) configPanel.style.display = "none";
        showToast("SYSTEM CONFIG SAVED & REBOOTED");
        toggleElectronHotkeys(true);
        if(localStream) startCamera();
    };
}

if (window.electronAPI) {
    const configBtn = document.getElementById("configBtn"); if (configBtn) configBtn.style.display = "inline-block";
    const inviteBtn = document.getElementById("inviteBtn"); if (inviteBtn) inviteBtn.style.display = "none";
    document.querySelectorAll(".download-section").forEach(s => s.style.display = "none");
    document.querySelectorAll(".briefing-box").forEach(b => b.style.display = "none");
    window.electronAPI.onHotkey((action) => { 
    if (action === "rec" && typeof handleRecordingToggle === "function") {
        // Direkter, sicherer Aufruf der Aufnahme-Funktion
        handleRecordingToggle(); 
    } else {
        // Standard-Klick für alle anderen Hotkeys
        const targetBtn = document.getElementById(hotkeys[action].btn); 
        if (targetBtn) targetBtn.click(); 
    }
});
}

document.addEventListener("keydown", (e) => {
    if (["messageInput", "usernameInput", "passwordInput", "newRoomInput"].includes(document.activeElement.id) || document.activeElement.classList.contains("hotkey-capture")) return;
    if (!e.key) return;
    const pressedKey = e.key.toLowerCase();
    Object.keys(hotkeys).forEach(key => {
        if (hotkeys[key].current && pressedKey === hotkeys[key].current.toLowerCase()) {
            e.preventDefault();
            if (key === "rec") { 
                // NEU: Einfach die Toggle Funktion aufrufen
                handleRecordingToggle();
            } else {
                const targetBtn = document.getElementById(hotkeys[key].btn);
                if (targetBtn) targetBtn.click();
            }
        }
    });
});

window.addEventListener('message', (event) => {
    if (event.data.type === 'SYNC_HOTKEYS') {
        const savedKeys = event.data.payload;
        Object.keys(savedKeys).forEach(key => {
            if (hotkeys[key]) {
                hotkeys[key].current = savedKeys[key];
                const inputEl = document.getElementById(hotkeys[key].id);
                if (inputEl) inputEl.value = savedKeys[key];
            }
        });
    }
});

// --- ONE-CLICK RECORDING SYSTEM ---

// 1. Der Auslöser (Button Klick)
recBtn.onclick = handleRecordingToggle;

// 2. Die zentrale Steuerungs-Funktion (auch für Hotkeys & Voice)
async function handleRecordingToggle() {
    // A) Wenn wir schon aufnehmen -> STOPPEN
    if (recBtn.classList.contains("recording")) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop(); // Das triggert onstop -> saveFile()
        }
        return;
    }

    // B) Wenn wir NICHT aufnehmen -> STARTEN
    // Haben wir schon einen Stream? (z.B. vom Screen Share oder vorheriger Aufnahme)
    if (globalScreenStream && globalScreenStream.active) {
        startRecordingProcess();
    } else {
        // Nein? Dann erst Stream holen, DANN sofort starten
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

            // Wenn der User im Browser-Popup "Abbrechen" drückt
            globalScreenStream.getVideoTracks()[0].onended = () => { 
                resetRecordingUI(); 
                globalScreenStream = null; 
            };

            // Wenn Stream da ist -> SOFORT LOSLEGEN
            startRecordingProcess();

        } catch (err) {
            console.error("Recording Start Failed:", err);
            // Nur Toast zeigen, wenn es kein "Abbruch durch User" war
            if (err.name !== 'NotAllowedError') {
                showToast("RECORDING FAILED: " + err.message, "error");
            }
        }
    }
}

// 3. Der eigentliche Aufnahmeprozess
function startRecordingProcess() {
    if (!globalScreenStream) return; // Sicherheitshalber

    recordedChunks = [];

    // Audio Setup (System + Mikrofon mischen)
    if (!globalAudioCtx) globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (globalAudioCtx.state === 'suspended') globalAudioCtx.resume();

    const dest = globalAudioCtx.createMediaStreamDestination();
    let hasAudio = false;

    // A) System Audio (vom Screen Stream)
    const screenAudioTracks = globalScreenStream.getAudioTracks();
    if (screenAudioTracks.length > 0) {
        const sysSource = globalAudioCtx.createMediaStreamSource(new MediaStream([screenAudioTracks[0]]));
        const sysGain = globalAudioCtx.createGain(); 
        sysGain.gain.value = 0.6; // Etwas leiser damit Stimme klarer ist
        sysSource.connect(sysGain);
        sysGain.connect(dest);
        hasAudio = true;
    }

    // B) Mikrofon Audio (vom lokalen Stream)
    if (localStream && localStream.getAudioTracks().length > 0) {
        const currentMicTrack = localStream.getAudioTracks()[0];
        if (currentMicTrack.readyState === 'live') {
            activeMicSource = globalAudioCtx.createMediaStreamSource(new MediaStream([currentMicTrack]));
            recMicGain = globalAudioCtx.createGain(); 
            recMicGain.gain.value = 2.0; // Mikrofon boosten
            activeMicSource.connect(recMicGain);
            recMicGain.connect(dest);
            hasAudio = true;
        }
    }

    // Streams kombinieren (Video + gemischtes Audio)
    const tracks = [];
    if (globalScreenStream.getVideoTracks().length > 0) {
        tracks.push(globalScreenStream.getVideoTracks()[0]);
    }
    if (hasAudio) {
        tracks.push(dest.stream.getAudioTracks()[0]);
    }

    const combinedStream = new MediaStream(tracks);
    
    // Beste Qualität erzwingen
    const options = { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 5000000 };
    // Fallback falls VP9 nicht geht
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm'; 
        delete options.videoBitsPerSecond;
    }

    try { 
        mediaRecorder = new MediaRecorder(combinedStream, options); 
        
        mediaRecorder.ondataavailable = (e) => { 
            if (e.data.size > 0) recordedChunks.push(e.data); 
        };
        
        mediaRecorder.onstop = () => { 
            saveFile(); 
            // Cleanup Audio Nodes
            if (activeMicSource) activeMicSource.disconnect();
            if (recMicGain) recMicGain.disconnect();
            activeMicSource = null; 
            recMicGain = null; 
        };
        
        mediaRecorder.start(1000); // Alle 1s Daten schreiben (sicherer bei Crash)

        // UI Update: Button wird ROT
        recBtn.classList.add("recording");
        recBtn.style.color = "#ff0000";
        recBtn.style.borderColor = "#ff0000";
        recBtn.style.boxShadow = "0 0 15px #ff0000";

        // Sound abspielen
        new Audio("https://assets.mixkit.co/active_storage/sfx/972/972-preview.mp3").play().catch(()=>{});
        showToast("MISSION LOG: RECORDING STARTED");

    } catch (err) { 
        console.error("MediaRecorder Error:", err);
        showToast("ERROR: RECORDER FAILED", "error");
        resetRecordingUI();
    }
}

function saveFile() {
    resetRecordingUI();
    recBtn.style.color = "#ffe600"; recBtn.style.borderColor = "#ffe600"; recBtn.style.boxShadow = "0 0 10px #ffe600";
    new Audio("https://assets.mixkit.co/active_storage/sfx/2044/2044-preview.mp3").play().catch(()=>{});
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `Mission-Log_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.webm`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
}

function resetRecordingUI() { recBtn.classList.remove("recording"); recBtn.style = ""; }

if ('mediaSession' in navigator) {
    const triggerRec = () => { if (globalScreenStream && globalScreenStream.active) toggleRecordingState(); };
    try { navigator.mediaSession.setActionHandler('play', triggerRec); navigator.mediaSession.setActionHandler('pause', triggerRec); navigator.mediaSession.setActionHandler('stop', triggerRec); } catch(e){}
}

function initVoiceCommands() {
    if (!recognition) return;
    try { recognition.stop(); } catch(e){}
    recognition.continuous = true; recognition.lang = 'de-DE'; recognition.interimResults = false;
    recognition.onstart = () => console.log("🎤 Voice Command System: LISTENING");
    recognition.onend = () => { if (localStream) setTimeout(() => { try { recognition.start(); } catch(e){} }, 1000); };
    recognition.onresult = (e) => {
        const last = e.results.length - 1; const cmd = e.results[last][0].transcript.trim().toLowerCase();
        if (["messageInput", "usernameInput", "passwordInput"].includes(document.activeElement.id)) return;
        if ((cmd.includes("aufnahme starten") || cmd.includes("system start") || cmd.includes("record start"))) { if(globalScreenStream && !recBtn.classList.contains("recording")) { toggleRecordingState(); showToast("VOICE: RECORDING INITIATED"); } }
        else if ((cmd.includes("aufnahme stoppen") || cmd.includes("system stop") || cmd.includes("record stop"))) { if(recBtn.classList.contains("recording")) { toggleRecordingState(); showToast("VOICE: RECORDING STOPPED"); } }
    };
    try { recognition.start(); } catch(e) {}
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div"); toast.className = `toast ${type}`;
    const iconClass = type === "error" ? "fa-exclamation-triangle" : "fa-check-circle";
    toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3"); audio.volume = 0.2; audio.play().catch(()=>{});
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = "fadeOutToast 0.5s forwards"; setTimeout(() => toast.remove(), 500); }, 4000);
}

document.getElementById("inviteBtn").onclick = () => { navigator.clipboard.writeText(window.location.href).then(() => showToast("COORDINATES COPIED TO CLIPBOARD")); };
const clickSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"); clickSound.volume = 0.1;

const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const emojiGrid = document.getElementById("emojiGrid");
loadEmojis("faces");
emojiBtn.onclick = () => { emojiPicker.style.display = emojiPicker.style.display === "none" ? "flex" : "none"; };
document.querySelectorAll(".tab-btn").forEach(btn => { 
    btn.onclick = () => { document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); loadEmojis(btn.getAttribute("data-cat")); }; 
});
function loadEmojis(cat) { 
    emojiGrid.innerHTML = ""; 
    (emojiMap[cat]||[]).forEach(e => { const s=document.createElement("span"); s.innerText=e; s.className="emoji-item"; s.onclick=()=>{msgInput.value+=e; msgInput.focus();}; emojiGrid.appendChild(s); }); 
}

const soundBtn = document.getElementById("soundBtn");
const soundBoard = document.getElementById("soundBoard");
soundBtn.onclick = () => { soundBoard.style.display = soundBoard.style.display === "none" ? "flex" : "none"; };
document.querySelectorAll(".sb-btn").forEach(btn => {
    btn.onclick = () => { const sid = btn.getAttribute("data-sound"); playSoundLocal(sid); socket.emit("play-sound", sid); };
});
function playSoundLocal(sid) { const audio = document.getElementById(sid); if(audio) { audio.currentTime=0; audio.play().catch(()=>{}); } }
socket.on("play-sound", (sid) => playSoundLocal(sid));

document.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) { const s = clickSound.cloneNode(); s.volume = 0.1; s.play().catch(()=>{}); }
    if (emojiPicker.style.display === "flex" && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) { emojiPicker.style.display = "none"; }
    if (soundBoard.style.display === "flex" && !soundBoard.contains(e.target) && !soundBtn.contains(e.target)) { soundBoard.style.display = "none"; }
    const configBtnEl = document.getElementById("configBtn");
    if (configPanel.style.display === "flex" && e.target === configPanel && !configBtnEl.contains(e.target)) { configPanel.style.display = "none"; toggleElectronHotkeys(true); }
});

// --- ADVANCED VOICE FX ENGINE (ROBUST VERSION) ---
let currentEffect = "none";
let fxAudioCtx = null;
let fxSource = null;
let fxDestination = null;
let fxNodes = []; 

// Wir holen die Elemente frisch, um sicherzugehen
const getFxElements = () => {
    return {
        btn: document.getElementById("radioBtn"),
        menu: document.getElementById("voiceFxMenu"),
        options: document.querySelectorAll(".vfx-btn")
    };
};

// 1. Initialisierung des Buttons (Wird direkt ausgeführt)
(() => {
    const { btn, menu } = getFxElements();
    
    if (btn && menu) {
        // Alten Listener entfernen durch Klonen (Trick 17)
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Neuen Listener setzen
        newBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); // Wichtig!
            
            // KLASSEN TOGGLE STATT STYLE
            menu.classList.toggle("show");
            
            // Sound Feedback beim Öffnen
            if(menu.classList.contains("show")) {
                 new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3").play().catch(()=>{});
            }
        };

        // Klick-Outside Listener
        document.addEventListener("click", (e) => {
            if (menu.classList.contains("show")) {
                if (!menu.contains(e.target) && !newBtn.contains(e.target)) {
                    menu.classList.remove("show");
                }
            }
        });
    } else {
        console.error("Voice FX Elemente nicht gefunden! Prüfe index.html");
    }
})();

// 2. Effekt Buttons Logik (Delegation für Sicherheit)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('vfx-btn') || e.target.closest('.vfx-btn')) {
        const btn = e.target.classList.contains('vfx-btn') ? e.target : e.target.closest('.vfx-btn');
        const effect = btn.getAttribute("data-effect");
        const { btn: mainRadioBtn, menu } = getFxElements();
        
        // UI Update
        document.querySelectorAll(".vfx-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        // Button Leucht-Status im Dock
        if (mainRadioBtn) {
            if (effect === "none") mainRadioBtn.classList.remove("active");
            else mainRadioBtn.classList.add("active");
        }

        applyVoiceEffect(effect);
        
        if (menu) menu.classList.remove("show"); // Menü schließen
        
        showToast(`VOICE MODULE: ${effect.toUpperCase()}`);
    }
});

// 3. Die Hauptfunktion für Audio-Verarbeitung
function applyVoiceEffect(type) {
    if (!localStream) {
        showToast("ACTIVATE CAMERA FIRST!", "error");
        return;
    }

    currentEffect = type;

    if (!fxAudioCtx) fxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (fxAudioCtx.state === 'suspended') fxAudioCtx.resume();

    // Aufräumen
    if (fxSource) { try { fxSource.disconnect(); } catch(e){} }
    fxNodes.forEach(n => { try { n.disconnect(); if(n.stop) n.stop(); } catch(e){} });
    fxNodes = [];

    const originalTrack = localStream.getAudioTracks()[0];
    
    // RESET
    if (type === "none") {
        refreshPeerTracks(originalTrack);
        return;
    }

    fxSource = fxAudioCtx.createMediaStreamSource(new MediaStream([originalTrack]));
    fxDestination = fxAudioCtx.createMediaStreamDestination();

    let lastNode = fxSource;

    // --- EFFEKT KETTEN ---
    if (type === "radio") {
        const filter = fxAudioCtx.createBiquadFilter();
        filter.type = "bandpass"; filter.frequency.value = 2000; filter.Q.value = 2;
        const dist = fxAudioCtx.createWaveShaper();
        dist.curve = makeDistortionCurve(100); dist.oversample = '4x';
        const hp = fxAudioCtx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 500;
        
        fxSource.connect(filter); filter.connect(dist); dist.connect(hp);
        lastNode = hp;
        fxNodes.push(filter, dist, hp);
    } 
    else if (type === "robot") {
        const osc = fxAudioCtx.createOscillator();
        osc.frequency.value = 50; osc.type = 'sine'; osc.start();
        const gainOsc = fxAudioCtx.createGain(); gainOsc.gain.value = 1000;
        const gainMod = fxAudioCtx.createGain(); gainMod.gain.value = 0.5;
        const filter = fxAudioCtx.createBiquadFilter();
        filter.type = "lowpass"; filter.frequency.value = 2000;

        osc.connect(gainMod.gain);
        fxSource.connect(filter); filter.connect(gainMod);
        lastNode = gainMod;
        fxNodes.push(osc, gainOsc, gainMod, filter);
    }
    else if (type === "cosmic") {
        const delay = fxAudioCtx.createDelay(); delay.delayTime.value = 0.25;
        const feedback = fxAudioCtx.createGain(); feedback.gain.value = 0.4;
        const filter = fxAudioCtx.createBiquadFilter(); filter.type = "highpass"; filter.frequency.value = 1000;
        const merger = fxAudioCtx.createChannelMerger(1);

        fxSource.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(filter);
        fxSource.connect(merger); filter.connect(merger);
        lastNode = merger;
        fxNodes.push(delay, feedback, filter, merger);
    }
    else if (type === "dark") {
        const lp = fxAudioCtx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.value = 400; lp.Q.value = 5;
        const gain = fxAudioCtx.createGain(); gain.gain.value = 2.0;
        
        fxSource.connect(lp); lp.connect(gain);
        lastNode = gain;
        fxNodes.push(lp, gain);
    }

    lastNode.connect(fxDestination);
    
    const processedTrack = fxDestination.stream.getAudioTracks()[0];
    refreshPeerTracks(processedTrack);
}

function refreshPeerTracks(newTrack) {
    for (let id in peers) {
        const sender = peers[id].getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) sender.replaceTrack(newTrack);
    }
    if (globalAudioCtx && activeMicSource && recMicGain) {
        activeMicSource.disconnect();
        activeMicSource = globalAudioCtx.createMediaStreamSource(new MediaStream([newTrack]));
        activeMicSource.connect(recMicGain);
    }
}

function makeDistortionCurve(amount) {
    let k = typeof amount === 'number' ? amount : 50, n_samples = 44100, curve = new Float32Array(n_samples), deg = Math.PI / 180, i = 0, x;
    for ( ; i < n_samples; ++i ) { x = i * 2 / n_samples - 1; curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) ); }
    return curve;
}

let roomStartTime = Date.now();
setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('de-DE', { hour12: false });
    const localTimeEl = document.getElementById("localTimeDisplay"); if (localTimeEl) localTimeEl.innerText = timeStr;
    const diffSeconds = Math.floor((now - roomStartTime) / 1000);
    const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(diffSeconds % 60).padStart(2, '0');
    const uptimeEl = document.getElementById("uptimeDisplay"); if (uptimeEl) uptimeEl.innerText = `${hrs}:${mins}:${secs}`;
}, 1000);
socket.on("join", () => { roomStartTime = Date.now(); });
socket.on("force-lobby", () => { roomStartTime = Date.now(); });

const lightbox = document.getElementById('imageLightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeLightboxBtn = document.querySelector('.close-lightbox');
window.openLightbox = (src) => { lightboxImg.src = src; lightbox.style.display = 'flex'; };
if (closeLightboxBtn) { closeLightboxBtn.onclick = () => lightbox.style.display = 'none'; }
lightbox.onclick = (e) => { if (e.target === lightbox) lightbox.style.display = 'none'; };
document.addEventListener('keydown', (e) => { if(e.key === "Escape" && lightbox.style.display === 'flex') { lightbox.style.display = 'none'; } });

const savePathDisplay = document.getElementById('savePathDisplay');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const storedPath = localStorage.getItem('customSavePath');
if (storedPath && window.electronAPI) { if (savePathDisplay) savePathDisplay.innerText = storedPath; window.electronAPI.setSavePath(storedPath); }
if (selectFolderBtn) {
    if (window.electronAPI) {
        selectFolderBtn.onclick = async () => {
            const path = await window.electronAPI.selectFolder();
            if (path) { if (savePathDisplay) savePathDisplay.innerText = path; localStorage.setItem('customSavePath', path); window.electronAPI.setSavePath(path); showToast("SPEICHERORT GEÄNDERT"); }
        };
    } else { selectFolderBtn.style.display = 'none'; if (savePathDisplay) savePathDisplay.innerText = "Browser-Downloads (Nicht änderbar)"; }
}

const snapBtn = document.getElementById('snapBtn');
if (snapBtn) {
    snapBtn.onclick = () => {
        if (window.electronAPI) {
            window.electronAPI.takeScreenshot();
            const flash = document.createElement('div');
            flash.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:white; z-index:9999; pointer-events:none; transition: opacity 0.3s ease; opacity: 0.8;";
            document.body.appendChild(flash);
            setTimeout(() => flash.style.opacity = "0", 50); setTimeout(() => flash.remove(), 300);
        } else { showToast("SCREENSHOTS NUR IM DESKTOP CLIENT VERFÜGBAR", "error"); }
    };
}

if (window.electronAPI) {
    window.electronAPI.onNotify((msg) => { showToast(msg); new Audio("https://assets.mixkit.co/active_storage/sfx/2044/2044-preview.mp3").play().catch(()=>{}); });
}