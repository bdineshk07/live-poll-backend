// src/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// In-memory store for polls
const polls = {};

// API: Create a poll
app.post("/api/poll", (req, res) => {
  const { question, options } = req.body;

  if (!question || !options || !Array.isArray(options)) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const pollId = uuidv4();
  polls[pollId] = {
    id: pollId,
    question,
    options,
    votes: Array(options.length).fill(0),
    active: false,
  };
  console.log("New poll created:", polls[pollId]);
  res.json({ pollId, poll: polls[pollId] });
});

// API: Get poll by ID
app.get("/api/poll/:id", (req, res) => {
  const poll = polls[req.params.id];
  if (!poll) return res.status(404).json({ error: "Poll not found" });
  res.json(poll);
});

// Socket.io connections
io.on("connection", (socket) => {
  // When teacher starts poll
  socket.on("teacher:startPoll", ({ pollId }, cb) => {
    const poll = polls[pollId];
    if (!poll) return cb && cb({ error: "Poll not found" });

    poll.active = true;
    poll.votes = Array(poll.options.length).fill(0);
    poll.answers = {}; // track which student has voted

    io.to(`poll:${pollId}`).emit("poll:started", {
      pollId,
      question: poll.question,
      options: poll.options,
      timeLimitSeconds: 60, // default
    });

    // automatic poll end after 60s
    setTimeout(() => {
      poll.active = false;
      io.to(`poll:${pollId}`).emit("poll:ended", {
        pollId,
        votes: poll.votes,
        total: poll.votes.reduce((a, b) => a + b, 0),
      });
    }, 60000);

    cb && cb({ ok: true });
  });

  // When student joins
  socket.on("student:join", ({ pollId, name }, cb) => {
    const poll = polls[pollId];
    if (!poll) return cb && cb({ error: "Poll not found" });

    socket.join(`poll:${pollId}`);
    if (!poll.participants) poll.participants = {};
    poll.participants[socket.id] = name;

    cb && cb({ ok: true });
  });

  // When student submits vote
  socket.on("student:submit", ({ pollId, optionIndex }, cb) => {
    const poll = polls[pollId];
    if (!poll || !poll.active) return cb && cb({ error: "No active poll" });

    if (poll.answers[socket.id] != null)
      return cb && cb({ error: "Already voted" });

    poll.answers[socket.id] = optionIndex;
    poll.votes[optionIndex] = (poll.votes[optionIndex] || 0) + 1;

    io.to(`poll:${pollId}`).emit("vote:updated", {
      votes: poll.votes,
      total: poll.votes.reduce((a, b) => a + b, 0),
    });

    cb && cb({ ok: true });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});