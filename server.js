const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const STATION_PASSWORD = "UpZocker2026";
let onlineUsers = {}; 
let activeRooms = ["Lobby"];

app.use(express.static(__dirname));

io.on("connection", socket => {
    socket.on("login", ({ username, password }) => {
        if (password !== STATION_PASSWORD) {
            socket.emit("login-error", "Falsches Passwort!");
            return;
        }
        socket.username = username; socket.authenticated = true;
        onlineUsers[socket.id] = { username, room: "Lobby" };
        socket.emit("login-success");
        io.emit("update-room-list", activeRooms);
    });

    socket.on("join", ({ room }) => {
        if (!socket.authenticated) return;
        Array.from(socket.rooms).forEach(r => { if(r !== socket.id) socket.leave(r); });
        socket.join(room); socket.room = room;
        if (onlineUsers[socket.id]) onlineUsers[socket.id].room = room;
        io.to(room).emit("sys-message", `${socket.username} ist da.`);
        io.emit("update-user-list", Object.values(onlineUsers));
    });

    socket.on("create-room", (name) => {
        if (!activeRooms.includes(name)) { activeRooms.push(name); io.emit("update-room-list", activeRooms); }
    });

    socket.on("delete-room", (name) => {
        if (name !== "Lobby") {
            activeRooms = activeRooms.filter(r => r !== name);
            io.emit("force-lobby-return", name);
            for (let id in onlineUsers) { if (onlineUsers[id].room === name) onlineUsers[id].room = "Lobby"; }
            io.emit("update-room-list", activeRooms);
            io.emit("update-user-list", Object.values(onlineUsers));
        }
    });

    socket.on("ready-for-video", () => { if (socket.authenticated) socket.to(socket.room).emit("user-ready", socket.id); });
    socket.on("video-offer", (d) => io.to(d.to).emit("video-offer", { offer: d.offer, from: socket.id }));
    socket.on("video-answer", (d) => io.to(d.to).emit("video-answer", { answer: d.answer, from: socket.id }));
    socket.on("new-ice-candidate", (d) => io.to(d.to).emit("new-ice-candidate", { candidate: d.candidate, from: socket.id }));
    socket.on("chat-message", (text) => { if (socket.authenticated) io.to(socket.room).emit("chat-message", { text, user: socket.username }); });

    socket.on("disconnect", () => {
        if (socket.username) {
            delete onlineUsers[socket.id]; io.emit("update-user-list", Object.values(onlineUsers));
            socket.to(socket.room).emit("user-disconnected", socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`UpZocker Station auf Port ${PORT}`));