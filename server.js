const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Current Bingo game
let game = {
  id: Date.now(),
  calledNumbers: [],
  status: "waiting",
  players: 0
};


// Home / health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🎱 Bingo Geda Server is running!",
    game: game
  });
});


// Get current game
app.get("/api/game", (req, res) => {
  res.json({
    success: true,
    game: game
  });
});


// Call next Bingo number
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
    return res.json({
      success: false,
      message: "All numbers have been called."
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


// Start a new game
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


// Join game
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


// Check server
app.get("/api/health", (req, res) => {

  res.json({
    status: "OK",
    server: "Bingo Geda",
    time: new Date().toISOString()
  });

});


app.listen(PORT, () => {

  console.log(
    `🎱 Bingo Geda Server running on port ${PORT}`
  );

});
