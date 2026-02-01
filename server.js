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
        io.emit("notify", `${username} ist online!`);
        updateAll();
    });

    socket.on("join", ({ room }) => {
        if (!socket.authenticated) return;
        socket.leave(socket.room); socket.join(room);
        socket.room = room; users[socket.id].room = room;
        updateAll();
    });

    socket.on("create-room", name => {
        if (name && !rooms.includes(name)) {
            rooms.push(name);
            io.emit("notify", `Raum erstellt: ${name}`);
            updateAll();
        }
    });

    socket.on("delete-room", name => {
        if (name !== "Lobby") {
            rooms = rooms.filter(r => r !== name);
            io.to(name).emit("force-lobby");
            io.emit("notify", `Raum ${name} geschlossen.`);
            updateAll();
        }
    });

    socket.on("chat-message", data => {
        io.to(socket.room).emit("chat-message", { ...data, user: socket.username });
    });

    socket.on("ready-for-video", () => socket.to(socket.room).emit("user-ready", { id: socket.id, name: socket.username }));
    socket.on("offer", d => io.to(d.to).emit("offer", { offer: d.offer, from: socket.id, name: d.name }));
    socket.on("answer", d => io.to(d.to).emit("answer", { answer: d.answer, from: socket.id }));
    socket.on("ice", d => io.to(d.to).emit("ice", { candidate: d.candidate, from: socket.id }));

    socket.on("disconnect", () => {
        if (users[socket.id]) {
            const name = users[socket.id].username;
            delete users[socket.id];
            io.emit("notify", `${name} ist offline.`);
            updateAll();
        }
    });

    function updateAll() {
        io.emit("update-data", { rooms, users: Object.values(users) });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Station läuft auf Port " + PORT));