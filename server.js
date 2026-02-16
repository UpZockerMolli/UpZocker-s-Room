const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); // 10MB Buffer für Datei-Uploads

const STATION_PASSWORD = "UpZocker2026";
let users = {};
let rooms = ["Lobby"];

app.use(express.static(__dirname));
app.use('/downloads', express.static('downloads'));

io.on("connection", socket => {
    
    // --- AUTHENTICATION ---
    socket.on("login", ({ username, password }) => {
        if (password !== STATION_PASSWORD) return socket.emit("login-error", "Zugriff verweigert: Falsches Passwort!");
        
        socket.username = username; 
        socket.authenticated = true;
        socket.room = "Lobby";
        users[socket.id] = { username, room: "Lobby" };
        
        socket.join("Lobby"); // Wichtig: User muss technisch dem Raum beitreten
        socket.emit("login-success");
        
        io.emit("notify", `[SYSTEM]: ${username} ist dem Netzwerk beigetreten.`);
        updateAll();
    });

    // --- ROOM MANAGEMENT ---
    
    // Raum betreten (Wechseln)
    socket.on("join", ({ room }) => {
        if (!socket.authenticated) return;
        
        const oldRoom = socket.room;
        
        // Alten Raum verlassen
        if(oldRoom) {
            socket.leave(oldRoom);
            io.to(oldRoom).emit("user-left", socket.id);
        }

        // Neuen Raum betreten
        socket.join(room);
        socket.room = room;
        users[socket.id].room = room;

        io.emit("notify", `[SYSTEM]: ${socket.username} verlegt in Sektor [${room}].`);
        updateAll();
    });

    // Raum erstellen
    socket.on("create-room", (roomName) => {
        if (!roomName || rooms.includes(roomName)) return; 
        
        rooms.push(roomName);
        io.emit("notify", `[SYSTEM]: Neuer Sektor [${roomName}] wurde initialisiert.`);
        updateAll();
    });

    // Raum löschen & User verschieben
    socket.on("delete-room", (roomName) => {
        if (roomName === "Lobby") return; // Lobby ist unzerstörbar

        // 1. Raum aus Liste entfernen
        rooms = rooms.filter(r => r !== roomName);

        // 2. Alle User in diesem Raum zwangsweise in die Lobby verschieben
        const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
        if (socketsInRoom) {
            for (const clientId of socketsInRoom) {
                const clientSocket = io.sockets.sockets.get(clientId);
                if (clientSocket) {
                    clientSocket.leave(roomName);
                    clientSocket.join("Lobby");
                    clientSocket.room = "Lobby";
                    if (users[clientId]) users[clientId].room = "Lobby";
                    clientSocket.emit("force-lobby"); // Client UI informieren
                }
            }
        }

        io.emit("notify", `[SYSTEM]: Sektor [${roomName}] wurde geschlossen. Alle Einheiten zur Lobby verlegt.`);
        updateAll();
    });

    // --- COMMUNICATION & FEATURES ---

    socket.on("chat-message", data => {
        if(socket.room) io.to(socket.room).emit("chat-message", { ...data, user: socket.username });
    });

    socket.on("typing", () => {
        if(socket.room) socket.to(socket.room).emit("user-typing", socket.username);
    });

    socket.on("stop-typing", () => {
        if(socket.room) socket.to(socket.room).emit("user-stop-typing");
    });

    socket.on("play-sound", (soundId) => {
        if(socket.room) socket.to(socket.room).emit("play-sound", soundId);
    });

    socket.on("toggle-afk", (isAfk) => {
        if(socket.room) socket.to(socket.room).emit("user-afk", { id: socket.id, isAfk: isAfk });
    });

    // --- WEBRTC SIGNALING (VIDEO) ---
    
    socket.on("ready-for-video", () => {
        if(socket.room) socket.to(socket.room).emit("user-ready", { id: socket.id, name: socket.username });
    });
    
    socket.on("offer", d => io.to(d.to).emit("offer", { offer: d.offer, from: socket.id, name: d.name }));
    socket.on("answer", d => io.to(d.to).emit("answer", { answer: d.answer, from: socket.id }));
    socket.on("ice", d => io.to(d.to).emit("ice", { candidate: d.candidate, from: socket.id }));

    // --- DISCONNECT ---
    socket.on("disconnect", () => {
        if (users[socket.id]) {
            const { room, username } = users[socket.id];
            
            // Video-Feed sauber entfernen
            io.to(room).emit("user-left", socket.id);
            
            delete users[socket.id];
            io.emit("notify", `${username} Verbindung unterbrochen.`);
            updateAll();
        }
    });

    // Helper: Sendet aktuelle Listen an alle
    function updateAll() {
        io.emit("update-data", { rooms, users: Object.values(users) });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`>> STATION ONLINE ON PORT ${PORT}`));