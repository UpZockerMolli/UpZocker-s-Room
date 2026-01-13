const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);

app.use(express.static(__dirname));

io.on("connection", (socket) => {
    console.log("Neuer Nutzer verbunden:", socket.id);

    socket.on("join audio", () => {
        socket.broadcast.emit("new audio user", socket.id);
    });

    socket.on("audio offer", (data) => {
        socket.broadcast.emit("audio offer", data);
    });

    socket.on("audio answer", (data) => {
        socket.broadcast.emit("audio answer", data);
    });

    socket.on("ice candidate", (data) => {
        socket.broadcast.emit("ice candidate", data);
    });

    socket.on("disconnect", () => {
        console.log("Nutzer getrennt:", socket.id);
    });
});

server.listen(3000, () => console.log("Server läuft auf http://localhost:3000"));