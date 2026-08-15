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
app.use(express.static(__dirname));

// ================================
// BINGO GAME
// ================================
let game = {
  id: Date.now().toString(),
  calledNumbers: [],
  status: "waiting",
  players: {},
  createdAt: new Date().toISOString()
};

// ================================
// HOME
// ================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ================================
// HEALTH CHECK
// ================================
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
    server: "Bingo Geda",
    time: new Date().toISOString()
  });
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
// CREATE NEW GAME
// ================================
app.post("/api/game/new", (req, res) => {

  game = {
    id: Date.now().toString(),
    calledNumbers: [],
    status: "waiting",
    players: {},
    createdAt: new Date().toISOString()
  };

  res.json({
    success: true,
    message: "🎱 New Bingo game created!",
    game: game
  });
});

// ================================
// JOIN GAME
// ================================
app.post("/api/game/join", (req, res) => {

  const playerId =
    req.body.playerId ||
    "player_" + Date.now();

  const playerName =
    req.body.name ||
    "Player";

  if (!game.players[playerId]) {

    game.players[playerId] = {
      id: playerId,
      name: playerName,
      joinedAt: new Date().toISOString(),
      card: []
    };

  }

  game.status = "playing";

  res.json({
    success: true,
    message: "🎮 Player joined Bingo Geda!",
    player: game.players[playerId],
    players: Object.keys(game.players).length,
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
      message: "All Bingo numbers have been called.",
      game: game
    });

  }

  const randomIndex =
    Math.floor(Math.random() * availableNumbers.length);

  const number =
    availableNumbers[randomIndex];

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
// GET CALLED NUMBERS
// ================================
app.get("/api/game/numbers", (req, res) => {

  res.json({
    success: true,
    calledNumbers: game.calledNumbers
  });

});

// ================================
// LEAVE GAME
// ================================
app.post("/api/game/leave", (req, res) => {

  const playerId = req.body.playerId;

  if (playerId && game.players[playerId]) {

    delete game.players[playerId];

  }

  res.json({
    success: true,
    message: "Player left the game.",
    players: Object.keys(game.players).length,
    game: game
  });

});

// ================================
// GAME STATUS
// ================================
app.get("/api/game/status", (req, res) => {

  res.json({
    success: true,
    status: game.status,
    players: Object.keys(game.players).length,
    calledNumbers: game.calledNumbers.length,
    gameId: game.id
  });

});

// ================================
// SERVER START
// ================================
app.listen(PORT, () => {

  console.log(
    `🎱 Bingo Geda Multiplayer Server running on port ${PORT}`
  );

});
