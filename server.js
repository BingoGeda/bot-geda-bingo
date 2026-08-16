const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// ======================================
// PORT
// ======================================

const PORT = process.env.PORT || 10000;

// ======================================
// SERVE MINI APP
// ======================================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ======================================
// GAME STORAGE
// ======================================

let game = createNewGame();

function createNewGame() {
  return {
    id: Date.now().toString(),
    calledNumbers: [],
    status: "waiting",
    players: {},
    createdAt: new Date().toISOString()
  };
}

// ======================================
// HEALTH
// ======================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
    server: "Bingo Geda",
    time: new Date().toISOString()
  });
});

// ======================================
// GET CURRENT GAME
// ======================================

app.get("/api/game", (req, res) => {
  res.json({
    success: true,
    game
  });
});

// ======================================
// CREATE NEW GAME
// ======================================

app.post("/api/game/new", (req, res) => {

  game = createNewGame();

  console.log("🎱 New game created:", game.id);

  res.status(200).json({
    success: true,
    message: "New Bingo game created!",
    game
  });
});

// ======================================
// JOIN GAME
// ======================================

app.post("/api/game/join", (req, res) => {

  const gameId = String(req.body.gameId || "");

  const playerId =
    String(
      req.body.playerId ||
      "player_" + Date.now()
    );

  const playerName =
    req.body.name ||
    "Player";

  // Check game ID
  if (gameId && gameId !== game.id) {

    return res.status(404).json({
      success: false,
      message: "Game not found.",
      gameId
    });

  }

  // Add player
  if (!game.players[playerId]) {

    game.players[playerId] = {
      id: playerId,
      name: playerName,
      joinedAt: new Date().toISOString()
    };

  }

  game.status = "playing";

  console.log(
    `👤 ${playerName} joined game ${game.id}`
  );

  res.json({
    success: true,
    message: "Player joined Bingo Geda!",
    player: game.players[playerId],
    game
  });
});

// ======================================
// CALL NUMBER
// ======================================

app.post("/api/game/call", (req, res) => {

  const gameId = String(req.body.gameId || "");

  // Check game ID
  if (gameId && gameId !== game.id) {

    return res.status(404).json({
      success: false,
      message: "Game not found.",
      gameId
    });

  }

  if (game.status === "finished") {

    return res.status(400).json({
      success: false,
      message: "Game is already finished.",
      game
    });

  }

  // Create numbers 1-75
  const allNumbers =
    Array.from(
      { length: 75 },
      (_, i) => i + 1
    );

  // Remove already called numbers
  const availableNumbers =
    allNumbers.filter(
      number =>
        !game.calledNumbers.includes(number)
    );

  // No numbers remaining
  if (availableNumbers.length === 0) {

    game.status = "finished";

    return res.json({
      success: false,
      message:
        "All Bingo numbers have been called.",
      game
    });

  }

  // Random number
  const randomIndex =
    Math.floor(
      Math.random() *
      availableNumbers.length
    );

  const number =
    availableNumbers[randomIndex];

  game.calledNumbers.push(number);

  game.status = "playing";

  console.log(
    `🔢 Number called: ${number}`
  );

  res.json({
    success: true,
    number,
    calledNumbers: game.calledNumbers,
    game
  });
});

// ======================================
// CALLED NUMBERS
// ======================================

app.get("/api/game/numbers", (req, res) => {

  res.json({
    success: true,
    calledNumbers: game.calledNumbers
  });

});

// ======================================
// LEAVE GAME
// ======================================

app.post("/api/game/leave", (req, res) => {

  const playerId =
    String(req.body.playerId || "");

  if (playerId && game.players[playerId]) {

    delete game.players[playerId];

  }

  const playerCount =
    Object.keys(game.players).length;

  if (playerCount === 0) {
    game.status = "waiting";
  }

  res.json({
    success: true,
    message: "Player left the game.",
    game
  });

});

// ======================================
// GAME STATUS
// ======================================

app.get("/api/game/status", (req, res) => {

  res.json({
    success: true,
    status: game.status,
    players:
      Object.keys(game.players).length,
    calledNumbers:
      game.calledNumbers.length,
    gameId: game.id
  });

});

// ======================================
// RESET GAME
// ======================================

app.post("/api/game/reset", (req, res) => {

  game = createNewGame();

  res.json({
    success: true,
    message: "Game reset.",
    game
  });

});

// ======================================
// 404 API
// ======================================

app.use("/api", (req, res) => {

  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });

});

// ======================================
// SERVER
// ======================================

app.listen(PORT, () => {

  console.log(
    `🎱 Bingo Geda Multiplayer Server running on port ${PORT}`
  );

  console.log(
    `🌐 Port: ${PORT}`
  );

});
