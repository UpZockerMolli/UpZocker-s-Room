const socket = io();
let currentRoom = "Lobby", myName = "";
let localStream = null;
let peers = {};
const chatSound = document.getElementById("chatSound");
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- LOGIN ---
document.getElementById("loginBtn").onclick = () => {
    myName = document.getElementById("usernameInput").value.trim();
    const pass = document.getElementById("passwordInput").value;
    if (myName && pass) socket.emit("login", { username: myName, password: pass });
};

socket.on("login-success", () => {
    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("appContainer").style.display = "flex";
    socket.emit("join", { room: "Lobby" });
});
socket.on("login-error", msg => document.getElementById("loginError").innerText = msg);

// --- SIDEBAR & ROOMS ---
document.getElementById("createRoomBtn").onclick = () => {
    const newName = prompt("Name für den neuen Raum:");
    if (newName && newName.trim() !== "") {
        socket.emit("create-room", newName.trim());
    }
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
            uSub.className = "user-sub-entry"; uSub.innerHTML = `<i class="fas fa-circle"></i> ${u.username}`;
            wrap.appendChild(uSub);
        });
        rList.appendChild(wrap);
    });
    document.getElementById("userList").innerHTML = users.map(u => `
        <div class="user-entry">
            <span class="neon-text-cyan"><i class="fas fa-user"></i> ${u.username}</span> 
            <span class="user-room-tag">${u.room}</span>
        </div>`).join("");
});

socket.on("notify", msg => {
    const area = document.getElementById("notification-area");
    const n = document.createElement("div"); n.className = "notification-toast"; n.innerText = msg;
    area.appendChild(n); setTimeout(() => n.remove(), 4000);
});
socket.on("force-lobby", () => switchRoom("Lobby"));

// --- VIDEO LOGIC ---
const startCamera = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const ph = document.getElementById("videoPlaceholder");
        if(ph) ph.remove(); 
        document.getElementById("videoControls").style.display = "flex";
        addVideoNode("local", myName, localStream, true);
        socket.emit("ready-for-video");
    } catch(e) { console.error("Kamerafehler:", e); alert("Kamera konnte nicht gestartet werden."); }
};

function attachStartBtn() {
    const btn = document.getElementById("initVideoBtn");
    if(btn) btn.onclick = startCamera;
}
attachStartBtn();

document.getElementById("muteBtn").onclick = () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const btn = document.getElementById("muteBtn");
        btn.classList.toggle("off", !audioTrack.enabled);
        btn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
};

document.getElementById("cameraBtn").onclick = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const btn = document.getElementById("cameraBtn");
        btn.classList.toggle("off", !videoTrack.enabled);
        btn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
};

document.getElementById("shareBtn").onclick = async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        }
        document.querySelector("#v-local video").srcObject = screenStream;
        screenTrack.onended = () => {
            const camTrack = localStream.getVideoTracks()[0];
            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(camTrack);
            }
            document.querySelector("#v-local video").srcObject = localStream;
        };
    } catch(e) { console.log("Screenshare abgebrochen"); }
};

// POPOUT
function drawCover(ctx, img, x, y, w, h) {
    if (!img.videoWidth) return;
    const iR = img.videoWidth / img.videoHeight, dR = w / h;
    let sx, sy, sw, sh;
    if (iR > dR) { sw = img.videoHeight * dR; sh = img.videoHeight; sx = (img.videoWidth - sw) / 2; sy = 0; }
    else { sw = img.videoWidth; sh = img.videoWidth / dR; sx = 0; sy = (img.videoHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

document.getElementById("popoutBtn").onclick = async () => {
    const canvas = document.getElementById("pipCanvas"), ctx = canvas.getContext("2d");
    const pipVid = document.getElementById("pipVideo");
    pipVid.srcObject = canvas.captureStream();
    pipVid.onloadedmetadata = async () => { try { await pipVid.play(); await pipVid.requestPictureInPicture(); } catch(e) {} };
    setInterval(() => {
        const vids = Array.from(document.querySelectorAll("#videoGrid video"));
        ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (vids.length === 0) return;
        const rows = vids.length > 3 ? 2 : 1, cols = Math.ceil(vids.length / rows);
        vids.forEach((v, i) => {
            const w = canvas.width / cols, h = canvas.height / rows;
            drawCover(ctx, v, (i % cols) * w, Math.floor(i / cols) * h, w, h);
        });
    }, 100);
};

document.getElementById("expandBtn").onclick = () => {
    const s = document.getElementById("videoChatSection");
    !document.fullscreenElement ? s.requestFullscreen().catch(()=>{}) : document.exitFullscreen();
};

function addVideoNode(id, name, stream, isLocal) {
    if (document.getElementById("v-" + id)) return;
    const wrap = document.createElement("div"); wrap.id = "v-" + id; wrap.className = "video-wrapper";
    const v = document.createElement("video"); v.autoplay = true; v.playsinline = true;
    if(isLocal) { v.muted = true; v.srcObject = stream; }
    const l = document.createElement("div"); l.className = "label"; l.innerText = name;
    wrap.append(v, l); document.getElementById("videoGrid").append(wrap);
    if(stream) setupVoice(stream, wrap);
    updateGridStyle();
}

function setupVoice(stream, el) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const ana = ctx.createAnalyser(); ana.fftSize = 256; src.connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const check = () => {
        ana.getByteFrequencyData(data);
        const vol = data.reduce((a,b)=>a+b)/data.length;
        el.classList.toggle("speaking", vol > 30);
        requestAnimationFrame(check);
    };
    check();
}

function updateGridStyle() {
    const count = document.querySelectorAll('.video-wrapper').length;
    const grid = document.getElementById("videoGrid");
    grid.classList.remove('grid-mode-1', 'grid-mode-2', 'grid-mode-many');
    if (count === 1) grid.classList.add('grid-mode-1');
    else if (count === 2) grid.classList.add('grid-mode-2');
    else grid.classList.add('grid-mode-many');
}

function switchRoom(newRoom) {
    if (newRoom === currentRoom) return;
    for (let id in peers) peers[id].close(); peers = {};
    const grid = document.getElementById("videoGrid"); grid.innerHTML = "";
    
    socket.emit("join", { room: newRoom }); currentRoom = newRoom;
    
    if (localStream) {
        addVideoNode("local", myName, localStream, true);
        setTimeout(() => socket.emit("ready-for-video"), 500);
    } else {
        const ph = document.createElement("div"); ph.id = "videoPlaceholder";
        ph.innerHTML = '<button id="initVideoBtn" class="big-start-btn">Kamera-Uplink starten</button>';
        grid.appendChild(ph);
        attachStartBtn();
        grid.className = "";
    }
}

// --- CHAT ---
document.getElementById("sendBtn").onclick = () => {
    const i = document.getElementById("messageInput");
    if (i.value.trim()) { socket.emit("chat-message", { text: i.value }); i.value = ""; }
};
document.getElementById("fileBtn").onclick = () => document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange = (e) => {
    const f = e.target.files[0];
    if (f) {
        const r = new FileReader();
        r.onload = () => socket.emit("chat-message", { type: "file", data: r.result, fileName: f.name });
        r.readAsDataURL(f);
    }
};

document.getElementById("emojiBtn").onclick = () => {
    const p = document.getElementById("emojiPicker");
    p.style.display = p.style.display === "none" ? "grid" : "none";
};
document.querySelectorAll(".emoji-picker span").forEach(s => {
    s.onclick = () => {
        document.getElementById("messageInput").value += s.innerText;
        document.getElementById("emojiPicker").style.display = "none";
    };
});

socket.on("chat-message", d => {
    const b = document.getElementById("chatBox");
    const cls = d.user === myName ? "neon-text-pink" : "neon-text-cyan";
    if (d.type === "file") {
        b.innerHTML += `<div><strong class="${cls}">${d.user}:</strong><br><a href="${d.data}" download="${d.fileName}" class="file-msg"><i class="fas fa-file-download"></i> ${d.fileName}</a></div>`;
    } else {
        b.innerHTML += `<div><strong class="${cls}">${d.user}:</strong> ${d.text}</div>`;
    }
    b.scrollTop = b.scrollHeight;
    if (d.user !== myName) chatSound.play().catch(()=>{});
});

// --- WEBRTC ---
socket.on("user-ready", ({ id, name }) => {
    const pc = new RTCPeerConnection(config); peers[id] = pc;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => e.candidate && socket.emit("ice", { candidate: e.candidate, to: id });
    addVideoNode(id, name, null, false);
    pc.ontrack = e => { const v = document.querySelector(`#v-${id} video`); if(v) v.srcObject = e.streams[0]; };
    pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => socket.emit("offer", { offer: pc.localDescription, to: id, name: myName }));
});

socket.on("offer", async d => {
    const pc = new RTCPeerConnection(config); peers[d.from] = pc;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => e.candidate && socket.emit("ice", { candidate: e.candidate, to: d.from });
    addVideoNode(d.from, d.name, null, false);
    pc.ontrack = e => { const v = document.querySelector(`#v-${d.from} video`); if(v) v.srcObject = e.streams[0]; };
    await pc.setRemoteDescription(d.offer);
    const a = await pc.createAnswer(); await pc.setLocalDescription(a);
    socket.emit("answer", { answer: a, to: d.from });
});
socket.on("answer", d => peers[d.from] && peers[d.from].setRemoteDescription(d.answer));
socket.on("ice", d => peers[d.from] && peers[d.from].addIceCandidate(d.candidate));