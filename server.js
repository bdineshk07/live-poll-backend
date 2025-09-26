// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors()); // allow all origins during development
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // replace with frontend URL in production
    methods: ["GET", "POST"],
  },
});

// Current poll state stored in memory
let currentPoll = null;

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Send the current poll to a newly connected client
  if (currentPoll) {
    socket.emit("newPoll", currentPoll);
  }

  // Teacher posts a new poll
  socket.on("postPoll", (pollData) => {
    currentPoll = { ...pollData, answers: [] }; // reset answers for new poll
    io.emit("newPoll", currentPoll); // broadcast to all clients
    console.log("Poll posted:", currentPoll);
  });

  // Student submits an answer
  socket.on("submitAnswer", ({ studentName, answer }) => {
    if (!currentPoll) return;

    // Prevent duplicate answers by same student
    const existingIndex = currentPoll.answers.findIndex(
      (a) => a.studentName === studentName
    );

    if (existingIndex !== -1) {
      currentPoll.answers[existingIndex] = { studentName, answer };
    } else {
      currentPoll.answers.push({ studentName, answer });
    }

    // Broadcast updated poll results
    io.emit("updateResults", currentPoll);
    console.log("Answer submitted:", { studentName, answer });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Set static port (no process.env to avoid errors in frontend linting)
const PORT = 4000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
