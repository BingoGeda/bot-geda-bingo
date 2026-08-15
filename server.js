const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// ================================
// PORT
// ================================
const PORT = process.env.PORT || 10000;


// ================================
// SERVE MINI APP
// ================================
// This serves index.html from the
// root of the GitHub repository.
app.use(express.static(path.join(__dirname)));


// ================================
// CURRENT BINGO GAME
// ================================
let game = {
  id: Date.now(),
  calledNumbers: [],
  status: "waiting",
  players: 0
};


// ================================
// HOME / MINI APP
// ================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


// ================================
// GET CURRENT GAME
// ================================
app.get("/api/game", (req, res) => {
  res.json({
    success: true,
    game: game
  });
});


// ================================
// CALL NEXT BINGO NUMBER
// ================================
app.post("/api/game/call", (req, res) => {

  if (game.status === "finished") {
    return res.status(400).json({
      success: false,
      message: "Game is already finished."
    });
  }

  const allNumbers = [];

  for (let i = 1; i <= 75; i++) {
    allNumbers.push(i);
  }

  const availableNumbers = allNumbers.filter(
    number => !game.calledNumbers.includes(number)
  );

  if (availableNumbers.length === 0) {

    game.status = "finished";

    return res.json({
      success: false,
      message: "All numbers have been called.",
      game: game
    });
  }

  const randomIndex =
    Math.floor(Math.random() * availableNumbers.length);

  const number = availableNumbers[randomIndex];

  game.calledNumbers.push(number);

  game.status = "playing";

  res.json({
    success: true,
    number: number,
    calledNumbers: game.calledNumbers,
    game: game
  });

});


// ================================
// START NEW GAME
// ================================
app.post("/api/game/new", (req, res) => {

  game = {
    id: Date.now(),
    calledNumbers: [],
    status: "waiting",
    players: 0
  };

  res.json({
    success: true,
    message: "🎱 New Bingo game started!",
    game: game
  });

});


// ================================
// JOIN GAME
// ================================
app.post("/api/game/join", (req, res) => {

  game.players++;

  game.status = "playing";

  res.json({
    success: true,
    message: "Player joined Bingo Geda!",
    players: game.players,
    game: game
  });

});


// ================================
// HEALTH CHECK
// ================================
app.get("/api/health", (req, res) => {

  res.json({
    status: "OK",
    server: "Bingo Geda",
    time: new Date().toISOString()
  });

});


// ================================
// SERVER START
// ================================
app.listen(PORT, () => {

  console.log(
    `🎱 Bingo Geda Server running on port ${PORT}`
  );

});
