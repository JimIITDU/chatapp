const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve client folder
app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// --- SOCKET.IO CONNECTION ---
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // THIS MUST BE INSIDE THE CONNECTION CALLBACK
  socket.on("sendMessage", (msg) => {
    console.log("Message received:", msg);
    io.emit("receiveMessage", msg); // broadcast to all clients
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// -------------------------
server.listen(5000, () => {
  console.log("Server running on port 5000");
});

const CHAT_PASSWORD = "vibecoding"; // you decide

io.use((socket, next) => {
  if (socket.handshake.auth.password === CHAT_PASSWORD) {
    next();
  } else {
    next(new Error("Unauthorized"));
  }
});
