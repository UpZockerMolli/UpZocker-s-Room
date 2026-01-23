const socket = io();
let currentRoom = "Lobby";
let localStream, screenStream = null, isSharing = false;
let peers = {}, popoutInterval = null, currentPopoutIndex = 0;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- LOGIN & EMOJIS ---
document.getElementById("loginBtn").onclick = () => {
    const name = document.getElementById("usernameInput").value.trim();
    const pass = document.getElementById("passwordInput").value;
    if (name && pass) socket.emit("login", { username: name, password: pass });
    else document.getElementById("loginError").innerText = "Bitte Name und Passwort!";
};

socket.on("login-success", () => {
    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("appContainer").style.display = "flex";
    socket.emit("join", { room: currentRoom });
});

socket.on("login-error", msg => document.getElementById("loginError").innerText = msg);

const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const messageInput = document.getElementById("messageInput");

emojiBtn.onclick = () => emojiPicker.style.display = emojiPicker.style.display === "none" ? "grid" : "none";
emojiPicker.querySelectorAll("span").forEach(s => {
    s.onclick = () => { messageInput.value += s.innerText; emojiPicker.style.display = "none"; messageInput.focus(); };
});

// --- ROOMS & USERS ---
socket.on("update-user-list", users => {
    const list = document.getElementById("userList"); list.innerHTML = "";
    users.forEach(u => {
        const div = document.createElement("div"); div.className = "user-entry";
        div.innerHTML = `<span><i class="fas fa-user"></i> ${u.username}</span><span class="user-room-tag">${u.room}</span>`;
        list.appendChild(div);
    });
});

socket.on("update-room-list", rooms => {
    const list = document.getElementById("roomList"); list.innerHTML = "";
    rooms.forEach(r => {
        const wrap = document.createElement("div"); wrap.className = "room-item-wrap";
        const div = document.createElement("div"); div.className = "room-entry" + (r === currentRoom ? " active-room" : "");
        div.innerHTML = `<i class="fas fa-hashtag"></i> ${r}`; div.onclick = () => switchRoom(r);
        wrap.appendChild(div);
        if (r !== "Lobby") {
            const btn = document.createElement("button"); btn.innerHTML = "&times;"; btn.className = "delete-room-btn";
            btn.onclick = (e) => { e.stopPropagation(); if(confirm(`Raum "${r}" löschen?`)) socket.emit("delete-room", r); };
            wrap.appendChild(btn);
        }
        list.appendChild(wrap);
    });
});

function switchRoom(newRoom) {
    if (newRoom === currentRoom) return;
    stopPopoutRotation();
    for (let id in peers) { peers[id].close(); delete peers[id]; }
    document.getElementById("videoGrid").querySelectorAll('.video-wrapper:not(#v-local)').forEach(el => el.remove());
    document.getElementById("chatBox").innerHTML = "";
    currentRoom = newRoom; document.getElementById("roomTitle").innerText = newRoom;
    socket.emit("join", { room: newRoom });
    if (localStream) socket.emit("ready-for-video");
}

socket.on("force-lobby-return", r => { if (currentRoom === r) switchRoom("Lobby"); });
document.getElementById("createRoomBtn").onclick = () => { const n = prompt("Raumname:"); if(n) socket.emit("create-room", n.trim()); };

// --- VIDEO & POP-OUT ---
document.getElementById("initVideoBtn").onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("videoPlaceholder").style.display = "none";
        document.getElementById("videoGrid").style.display = "flex";
        document.getElementById("videoControls").style.display = "flex";
        addVideoNode("local", "Ich", localStream, true);
        socket.emit("ready-for-video");
    } catch (e) { alert("Kamera-Zugriff verweigert."); }
};

document.getElementById("popoutBtn").onclick = async () => {
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); stopPopoutRotation(); }
    else startPopoutRotation();
};

function startPopoutRotation() {
    const rotate = async () => {
        const vids = Array.from(document.querySelectorAll("#videoGrid video"));
        if (vids.length === 0) return;
        if (currentPopoutIndex >= vids.length) currentPopoutIndex = 0;
        try { await vids[currentPopoutIndex].requestPictureInPicture(); if (vids.length > 1) currentPopoutIndex++; } catch (e) {}
    };
    rotate(); popoutInterval = setInterval(rotate, 10000);
}
function stopPopoutRotation() { if (popoutInterval) { clearInterval(popoutInterval); popoutInterval = null; } }

// --- WebRTC & Chat ---
socket.on("user-ready", id => { if (localStream) initCall(id); });
async function initCall(id) {
    const pc = createPeerConnection(id);
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    socket.emit("video-offer", { offer, to: id });
}
socket.on("video-offer", async (d) => {
    const pc = createPeerConnection(d.from); await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    socket.emit("video-answer", { answer: ans, to: d.from });
});
socket.on("video-answer", d => peers[d.from].setRemoteDescription(new RTCSessionDescription(d.answer)));
socket.on("new-ice-candidate", d => { if (peers[d.from]) peers[d.from].addIceCandidate(new RTCIceCandidate(d.candidate)); });

function createPeerConnection(id) {
    const pc = new RTCPeerConnection(config); peers[id] = pc;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = (e) => addVideoNode(id, "User", e.streams[0], false);
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit("new-ice-candidate", { candidate: e.candidate, to: id }); };
    return pc;
}

function addVideoNode(id, name, stream, isLocal) {
    if (document.getElementById("v-" + id)) return;
    const wrap = document.createElement("div"); wrap.id = "v-" + id; wrap.className = "video-wrapper";
    const v = document.createElement("video"); v.srcObject = stream; v.autoplay = true; v.playsinline = true; if(isLocal) v.muted = true;
    const l = document.createElement("div"); l.className = "label"; l.innerText = name;
    wrap.append(v, l); document.getElementById("videoGrid").append(wrap);
}

document.getElementById("sendBtn").onclick = () => { if (messageInput.value) { socket.emit("chat-message", messageInput.value); messageInput.value = ""; } };
socket.on("chat-message", d => {
    const div = document.createElement("div"); div.className = "msg"; div.innerHTML = `<strong>${d.user}:</strong> ${d.text}`;
    document.getElementById("chatBox").append(div); document.getElementById("chatBox").scrollTop = document.getElementById("chatBox").scrollHeight;
});
socket.on("sys-message", t => {
    const div = document.createElement("div"); div.className = "msg sys-msg"; div.innerHTML = `<em>${t}</em>`;
    document.getElementById("chatBox").append(div);
});
socket.on("user-disconnected", id => { if (peers[id]) peers[id].close(); delete peers[id]; document.getElementById("v-" + id)?.remove(); });