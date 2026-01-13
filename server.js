const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);

const PORT = 3000;

app.use(express.static(__dirname));

let users = {}; // { socket.id: username }

io.on("connection", socket => {

    socket.on("join", username => {
        users[socket.id] = username;
        socket.emit("existing users", Object.keys(users).filter(id=>id!==socket.id));
        socket.broadcast.emit("new user", socket.id);
    });

    socket.on("chat message", msg => {
        io.emit("chat message", msg);
    });

    socket.on("join video", username => {
        users[socket.id] = username;
    });

    socket.on("video offer", data => {
        io.to(data.to).emit("video offer", { offer: data.offer, from: socket.id });
    });

    socket.on("video answer", data => {
        io.to(data.to).emit("video answer", { answer: data.answer, from: socket.id });
    });

    socket.on("ice candidate", data => {
        io.to(data.to).emit("ice candidate", { candidate: data.candidate, from: socket.id });
    });

    socket.on("disconnect", () => {
        const name = users[socket.id];
        if (name) io.emit("chat message", `👋 ${name} hat den Videochat verlassen`);
        delete users[socket.id];
    });

});

server.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));