const startBtn = document.getElementById("startBtn");
const remoteAudio = document.getElementById("remoteAudio");

let localStream;
let pc;

const socket = io();

const ICE_SERVERS = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

startBtn.addEventListener("click", async () => {
    try {
        // Mikrofon holen
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log("Mikrofon bereit:", localStream.getAudioTracks());

        pc = new RTCPeerConnection(ICE_SERVERS);

        // Eigene Audio-Tracks senden
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // Remote-Audio empfangen
        pc.ontrack = (event) => {
            console.log("Remote Audio erhalten:", event.streams[0].getAudioTracks());
            remoteAudio.srcObject = event.streams[0];
        };

        // ICE-Kandidaten austauschen
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice candidate", { candidate: event.candidate });
            }
        };

        // Server informieren, dass wir bereit sind
        socket.emit("join audio");

    } catch (err) {
        console.error("Fehler beim Zugriff auf Mikrofon:", err);
        alert("Kamera/Mikrofon konnte nicht gestartet werden!");
    }
});

// Angebot empfangen / senden
socket.on("audio offer", async (data) => {
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("audio answer", { answer });
});

socket.on("audio answer", async (data) => {
    await pc.setRemoteDescription(data.answer);
});

socket.on("ice candidate", async (data) => {
    if (data.candidate) await pc.addIceCandidate(data.candidate);
});