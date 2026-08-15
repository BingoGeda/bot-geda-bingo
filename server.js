const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;

// ========================================
// GAME ROOMS
// ========================================

let games = {};


// ========================================
// CREATE NEW GAME
// ========================================

function createGame() {

  const gameId = Date.now().toString();

  games[gameId] = {
    id: gameId,
    status: "waiting",
    players: {},
    calledNumbers: [],
    createdAt: new Date().toISOString()
  };

  return games[gameId];
}


// ========================================
// GENERATE BINGO CARD
// ========================================

function generateCard() {

  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75]
  ];

  const columns = [];

  for (let column = 0; column < 5; column++) {

    const numbers = [];

    for (
      let number = ranges[column][0];
      number <= ranges[column][1];
      number++
    ) {
      numbers.push(number);
    }

    numbers.sort(() => Math.random() - 0.5);

    columns.push(numbers.slice(0, 5));
  }


  const card = [];

  for (let row = 0; row < 5; row++) {

    for (let column = 0; column < 5; column++) {

      if (row === 2 && column === 2) {
        card.push("FREE");
      } else {
        card.push(columns[column][row]);
      }

    }

  }

  return card;
}


// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

});


// ========================================
// HEALTH
// ========================================

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    status: "OK",
    server: "Bingo Geda",
    time: new Date().toISOString()
  });

});


// ========================================
// CREATE GAME
// ========================================

app.post("/api/game/create", (req, res) => {

  const game = createGame();

  res.json({
    success: true,
    message: "🎱 New Bingo game created!",
    game: game
  });

});


// ========================================
// GET GAME
// ========================================

app.get("/api/game/:gameId", (req, res) => {

  const game =
    games[req.params.gameId];

  if (!game) {

    return res.status(404).json({
      success: false,
      message: "Game not found."
    });

  }

  res.json({
    success: true,
    game: game
  });

});


// ========================================
// JOIN GAME
// ========================================

app.post("/api/game/:gameId/join", (req, res) => {

  const game =
    games[req.params.gameId];

  if (!game) {

    return res.status(404).json({
      success: false,
      message: "Game not found."
    });

  }


  const telegramUser =
    req.body.user || {};


  const userId =
    String(
      telegramUser.id ||
      "guest-" + Date.now()
    );


  if (!game.players[userId]) {

    game.players[userId] = {

      id: userId,

      firstName:
        telegramUser.first_name ||
        "Guest",

      username:
        telegramUser.username ||
        "",

      card:
        generateCard(),

      joinedAt:
        new Date().toISOString()

    };

  }


  res.json({

    success: true,

    message:
      "🎉 Player joined Bingo Geda!",

    player:
      game.players[userId],

    game: game

  });

});


// ========================================
// CALL NEXT NUMBER
// ========================================

app.post("/api/game/:gameId/call", (req, res) => {

  const game =
    games[req.params.gameId];

  if (!game) {

    return res.status(404).json({
      success: false,
      message: "Game not found."
    });

  }


  if (game.calledNumbers.length >= 75) {

    game.status = "finished";

    return res.json({

      success: false,

      message:
        "All Bingo numbers have been called.",

      game: game

    });

  }


  const available = [];

  for (let i = 1; i <= 75; i++) {

    if (!game.calledNumbers.includes(i)) {

      available.push(i);

    }

  }


  const index =
    Math.floor(
      Math.random() * available.length
    );


  const number =
    available[index];


  game.calledNumbers.push(number);

  game.status = "playing";


  res.json({

    success: true,

    number: number,

    calledNumbers:
      game.calledNumbers,

    game: game

  });

});


// ========================================
// LIST GAMES
// ========================================

app.get("/api/games", (req, res) => {

  res.json({

    success: true,

    games:
      Object.values(games)

  });

});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {

  console.log(
    `🎱 Bingo Geda Multiplayer Server running on port ${PORT}`
  );

});
