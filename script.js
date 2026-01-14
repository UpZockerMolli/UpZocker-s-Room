const socket = io();

// DOM
const loginBtn = document.getElementById("loginBtn");
const loginContainer = document.getElementById("loginContainer");
const appContainer = document.getElementById("appContainer");
const usernameInput = document.getElementById("username");

const startVideoBtn = document.getElementById("startVideoBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");

const chatBox = document.getElementById("chatBox");
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");

const videoGrid = document.getElementById("videoGrid");

// State
let username = "";
let localStream = null;
let peers = {};
let audioEnabled = true;
let videoEnabled = true;
let pendingUsers = [];

// ✅ STUN + TURN Server
const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: "turn:numb.viagenie.ca",
            credential: "muazkh",
            username: "webrtc@live.com"
        }
    ]
};

// ===== LOGIN =====
loginBtn.onclick = () => {
    username = usernameInput.value.trim();
    if (!username) return alert("Bitte Namen eingeben");

    loginContainer.style.display = "none";
    appContainer.style.display = "flex";

    socket.emit("join", username);
    socket.emit("chat message", `👋 ${username} ist dem Videochat beigetreten`);
};

// ===== CHAT =====
sendBtn.onclick = () => {
    const msg = messageInput.value.trim();
    if (!msg) return;
    socket.emit("chat message", `${username}: ${msg}`);
    messageInput.value = "";
};

socket.on("chat message", msg => {
    const div = document.createElement("div");
    div.className = "chat-message";
    div.innerText = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// ===== VIDEO START =====
startVideoBtn.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    const hiddenVideo = document.createElement("video");
    hiddenVideo.srcObject = localStream;
    hiddenVideo.muted = true;
    hiddenVideo.autoplay = true;
    hiddenVideo.style.display = "none";
    document.body.appendChild(hiddenVideo);

    socket.emit("join video", username);

    pendingUsers.forEach(id => createPeer(id, true));
    pendingUsers = [];
};

// ===== MUTE / CAMERA =====
muteBtn.onclick = () => {
    if (!localStream) return;
    audioEnabled = !audioEnabled;
    localStream.getAudioTracks().forEach(t => t.enabled = audioEnabled);
    muteBtn.textContent = audioEnabled ? "Stumm" : "Ton an";
};

cameraBtn.onclick = () => {
    if (!localStream) return;
    videoEnabled = !videoEnabled;
    localStream.getVideoTracks().forEach(t => t.enabled = videoEnabled);
    cameraBtn.textContent = videoEnabled ? "Kamera aus" : "Kamera an";
};

// ===== WEBRTC =====
socket.on("existing users", users => {
    if (!localStream) {
        pendingUsers = users;
        return;
    }
    users.forEach(id => createPeer(id, true));
});

socket.on("new user", id => {
    createPeer(id, false);
});

socket.on("video offer", async data => {
    const pc = createPeer(data.from, false);
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("video answer", { to: data.from, answer });
});

socket.on("video answer", data => {
    peers[data.from]?.setRemoteDescription(data.answer);
});

socket.on("ice candidate", data => {
    peers[data.from]?.addIceCandidate(data.candidate);
});

// ===== PEER CREATION =====
function createPeer(userId, isInitiator) {
    if (peers[userId]) return peers[userId];
    if (!localStream) return; // ⬅️ WICHTIG

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peers[userId] = pc;

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = e => addRemoteVideo(userId, e.streams[0]);

    pc.onicecandidate = e => {
        if (e.candidate) {
            socket.emit("ice candidate", {
                to: userId,
                candidate: e.candidate
            });
        }
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit("video offer", { to: userId, offer });
        });
    }

    return pc;
}

// ===== VIDEO UI =====
function addRemoteVideo(userId, stream) {
    if (document.getElementById(`video-${userId}`)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";
    wrapper.id = `video-${userId}`;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;

    const label = document.createElement("div");
    label.className = "username-label";
    label.innerText = "Teilnehmer";

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videoGrid.appendChild(wrapper);

    monitorSpeaker(stream, wrapper);
}

// ===== SPEAKER HIGHLIGHT =====
function monitorSpeaker(stream, wrapper) {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();

    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    function checkVolume() {
        analyser.getByteFrequencyData(data);
        const volume = data.reduce((a,b)=>a+b,0)/data.length;

        if (volume>30) wrapper.classList.add("active-speaker");
        else wrapper.classList.remove("active-speaker");

        requestAnimationFrame(checkVolume);
    }

    checkVolume();
}