const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const users = {};

io.on("connection", socket => {

    // ===== JOIN =====
    socket.on("join", ({ username, room }) => {
    socket.join(room);

    socket.username = username;
    socket.room = room;

    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    const others = clients.filter(id => id !== socket.id);

    socket.emit("existing users", others);
    socket.to(room).emit("new user", socket.id, username);
});

    // ===== CHAT =====
    socket.on("chat message", msg => {
        io.to(socket.room).emit("chat message", msg);
    });

    // ===== VIDEO OFFER =====
    socket.on("video offer", data => {
        io.to(data.to).emit("video offer", {
            offer: data.offer,
            from: socket.id,
            username: data.username
        });
    });

    // ===== VIDEO ANSWER =====
    socket.on("video answer", data => {
        io.to(data.to).emit("video answer", {
            answer: data.answer,
            from: socket.id
        });
    });

    // ===== ICE =====
    socket.on("ice candidate", data => {
        io.to(data.to).emit("ice candidate", {
            candidate: data.candidate,
            from: socket.id
        });
    });

    // ===== DISCONNECT =====
    socket.on("disconnect", () => {
        const name = users[socket.id];

        socket.to(socket.room).emit("user disconnected", socket.id, socket.username);
        delete users[socket.id];
    });

});

server.listen(PORT, () => {
    console.log("Server läuft auf Port", PORT);
});