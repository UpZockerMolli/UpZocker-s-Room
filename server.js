const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const STATION_PASSWORD = "UpZocker2026";
let users = {}, rooms = ["Lobby"];

app.use(express.static(__dirname));

io.on("connection", socket => {
    socket.on("login", ({ username, password }) => {
        if (password !== STATION_PASSWORD) return socket.emit("login-error", "Falsches Passwort!");
        socket.username = username; socket.authenticated = true;
        users[socket.id] = { username, room: "Lobby" };
        socket.emit("login-success");
        // Notify als System Message & Toast
        io.emit("notify", `${username} ist online.`);
        updateAll();
    });

    // RAUM BETRETEN (Vereinfacht)
    socket.on("join", ({ room }) => {
        if (!socket.authenticated) return;
        const oldRoom = socket.room;
        
        if(oldRoom) {
            socket.leave(oldRoom);
            io.to(oldRoom).emit("user-left", socket.id);
        }

        socket.join(room);
        socket.room = room;
        users[socket.id].room = room;

        io.emit("notify", `[SYSTEM]: ${socket.username} verlegt in Sektor [${room}].`);
        updateAll();
    });
    // NEU: Nur Raum erstellen (ohne beitreten)
    socket.on("create-room", (roomName) => {
        if (!roomName || rooms.includes(roomName)) return; // Gibts schon oder leer
        
        rooms.push(roomName);
        io.emit("notify", `[SYSTEM]: Neuer Sektor [${roomName}] wurde initialisiert.`);
        updateAll();
    });

    // NEU: Raum löschen
    socket.on("delete-room", (roomName) => {
        // Lobby darf niemals gelöscht werden
        if (roomName === "Lobby") return;

        // 1. Aus Liste entfernen
        rooms = rooms.filter(r => r !== roomName);

        // 2. Alle User in diesem Raum zwangsweise in die Lobby verschieben
        // Wir suchen alle Sockets in diesem Raum
        const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
        if (socketsInRoom) {
            for (const clientId of socketsInRoom) {
                const clientSocket = io.sockets.sockets.get(clientId);
                if (clientSocket) {
                    clientSocket.leave(roomName);
                    clientSocket.join("Lobby");
                    clientSocket.room = "Lobby";
                    if (users[clientId]) users[clientId].room = "Lobby";
                    clientSocket.emit("force-lobby"); // Signal an Client (optional)
                }
            }
        }

        io.emit("notify", `[SYSTEM]: Sektor [${roomName}] wurde geschlossen. Alle Einheiten zur Lobby verlegt.`);
        updateAll();
    });

    socket.on("chat-message", data => {
        io.to(socket.room).emit("chat-message", { ...data, user: socket.username });
    });

    // --- TYPING EVENTS ---
    socket.on("typing", () => {
        if(socket.room) socket.to(socket.room).emit("user-typing", socket.username);
    });

    socket.on("stop-typing", () => {
        if(socket.room) socket.to(socket.room).emit("user-stop-typing");
    });

    // --- SOUNDBOARD EVENT ---
    socket.on("play-sound", (soundId) => {
        // Sende Sound an alle im Raum (außer an mich selbst, ich spiele ihn lokal)
        if(socket.room) socket.to(socket.room).emit("play-sound", soundId);
    });
        // AFK Status weiterleiten
    socket.on("toggle-afk", (isAfk) => {
        if(socket.room) {
            // Sende an alle anderen im Raum, wer AFK ist und ob an/aus
            socket.to(socket.room).emit("user-afk", { id: socket.id, isAfk: isAfk });
        }
    });

    // --- VIDEO EVENTS ---
    socket.on("ready-for-video", () => socket.to(socket.room).emit("user-ready", { id: socket.id, name: socket.username }));
    socket.on("offer", d => io.to(d.to).emit("offer", { offer: d.offer, from: socket.id, name: d.name }));
    socket.on("answer", d => io.to(d.to).emit("answer", { answer: d.answer, from: socket.id }));
    socket.on("ice", d => io.to(d.to).emit("ice", { candidate: d.candidate, from: socket.id }));

    socket.on("disconnect", () => {
        if (users[socket.id]) {
            const { room, username } = users[socket.id];
            
            // NEU: Dem Raum sagen, dass diese ID weg ist (damit das Video gelöscht wird)
            io.to(room).emit("user-left", socket.id);
            
            delete users[socket.id];
            io.emit("notify", `${username} ist offline.`);
            updateAll();
        }
    });

    function updateAll() {
        io.emit("update-data", { rooms, users: Object.values(users) });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Station läuft auf Port " + PORT));