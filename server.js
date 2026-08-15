const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;


// ========================================
// SERVE BINGO GEDA MINI APP
// ========================================

app.use(express.static(__dirname));


// ========================================
// GAME ROOMS
// ========================================

const games = {};


// ========================================
// CREATE BINGO CARD
// ========================================

function createBingoCard() {

  const card = [];

  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75]
  ];

  for (let column = 0; column < 5; column++) {

    let numbers = [];

    for (
      let number = ranges[column][0];
      number <= ranges[column][1];
      number++
    ) {
      numbers.push(number);
    }

    // Shuffle numbers
    numbers.sort(() => Math.random() - 0.5);

    for (let row = 0; row < 5; row++) {

      if (column === 2 && row === 2) {

        card.push("FREE");

      } else {

        card.push(numbers[row]);

      }

    }
  }


  // Convert columns to rows
  const finalCard = [];

  for (let row = 0; row < 5; row++) {

    for (let column = 0; column < 5; column++) {

      finalCard.push(
        card[column * 5 + row]
      );

    }
  }

  return finalCard;
}


// ========================================
// CREATE NEW GAME
// ========================================

function createNewGame() {

  const id = Date.now().toString();

  const game = {

    id: id,

    calledNumbers: [],

    status: "waiting",

    players: {},

    createdAt: new Date().toISOString()

  };

  games[id] = game;

  return game;
}


// ========================================
// GET GAME
// ========================================

function getGame(id) {

  return games[id];

}


// ========================================
// HOME / MINI APP
// ========================================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

});


// ========================================
// HEALTH CHECK
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
// GET CURRENT GAME
// ========================================

app.get("/api/game", (req, res) => {

  let game = Object.values(games)[0];

  if (!game) {

    game = createNewGame();

  }

  res.json({

    success: true,

    game: game

  });

});


// ========================================
// CREATE GAME
// ========================================

app.post("/api/game/create", (req, res) => {

  const game = createNewGame();

  res.json({

    success: true,

    message: "🎱 Bingo game created!",

    game: game

  });

});


// ========================================
// GET GAME BY ID
// ========================================

app.get("/api/game/:id", (req, res) => {

  const game =
    getGame(req.params.id);

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

app.post("/api/game/:id/join", (req, res) => {

  const game =
    getGame(req.params.id);

  if (!game) {

    return res.status(404).json({

      success: false,

      message: "Game not found."

    });

  }


  const user =
    req.body.user || {};


  const userId =
    String(
      user.id ||
      "guest-" + Date.now()
    );


  // Player already joined
  if (game.players[userId]) {

    return res.json({

      success: true,

      message: "Player already joined.",

      player:
        game.players[userId],

      game: game

    });

  }


  // Create player
  const player = {

    id: userId,

    name:
      user.first_name ||
      "Guest",

    username:
      user.username ||
      "",

    card:
      createBingoCard(),

    joinedAt:
      new Date().toISOString()

  };


  game.players[userId] =
    player;


  game.status =
    "playing";


  res.json({

    success: true,

    message:
      "🎮 Player joined Bingo Geda!",

    player: player,

    game: game

  });

});


// ========================================
// CALL NEXT BINGO NUMBER
// ========================================

app.post("/api/game/:id/call", (req, res) => {

  const game =
    getGame(req.params.id);


  if (!game) {

    return res.status(404).json({

      success: false,

      message: "Game not found."

    });

  }


  if (
    game.status === "finished"
  ) {

    return res.status(400).json({

      success: false,

      message:
        "Game is already finished."

    });

  }


  const availableNumbers =
    Array.from(
      { length: 75 },
      (_, index) => index + 1
    )
    .filter(
      number =>
        !game.calledNumbers.includes(number)
    );


  if (
    availableNumbers.length === 0
  ) {

    game.status =
      "finished";


    return res.json({

      success: false,

      message:
        "All Bingo numbers have been called.",

      game: game

    });

  }


  const randomIndex =
    Math.floor(
      Math.random() *
      availableNumbers.length
    );


  const number =
    availableNumbers[randomIndex];


  game.calledNumbers.push(
    number
  );


  game.status =
    "playing";


  res.json({

    success: true,

    number: number,

    calledNumbers:
      game.calledNumbers,

    game: game

  });

});


// ========================================
// START NEW GAME
// ========================================

app.post("/api/game/new", (req, res) => {

  const game =
    createNewGame();


  res.json({

    success: true,

    message:
      "🎱 New Bingo game created!",

    game: game

  });

});


// ========================================
// LEGACY JOIN
// ========================================

app.post("/api/game/join", (req, res) => {

  let game =
    Object.values(games)[0];


  if (!game) {

    game =
      createNewGame();

  }


  const user =
    req.body.user || {};


  const userId =
    String(
      user.id ||
      "guest-" + Date.now()
    );


  if (!game.players[userId]) {

    game.players[userId] = {

      id: userId,

      name:
        user.first_name ||
        "Guest",

      username:
        user.username ||
        "",

      card:
        createBingoCard(),

      joinedAt:
        new Date().toISOString()

    };

  }


  game.status =
    "playing";


  res.json({

    success: true,

    message:
      "🎮 Player joined Bingo Geda!",

    player:
      game.players[userId],

    players:
      Object.keys(game.players).length,

    game:
      game

  });

});


// ========================================
// LEGACY CALL
// ========================================

app.post("/api/game/call", (req, res) => {

  let game =
    Object.values(games)[0];


  if (!game) {

    return res.status(404).json({

      success: false,

      message:
        "No active game."

    });

  }


  if (
    game.status === "finished"
  ) {

    return res.status(400).json({

      success: false,

      message:
        "Game is already finished."

    });

  }


  const availableNumbers =
    Array.from(
      { length: 75 },
      (_, index) => index + 1
    )
    .filter(
      number =>
        !game.calledNumbers.includes(number)
    );


  if (
    availableNumbers.length === 0
  ) {

    game.status =
      "finished";


    return res.json({

      success: false,

      message:
        "All Bingo numbers have been called.",

      game:
        game

    });

  }


  const randomIndex =
    Math.floor(
      Math.random() *
      availableNumbers.length
    );


  const number =
    availableNumbers[randomIndex];


  game.calledNumbers.push(
    number
  );


  game.status =
    "playing";


  res.json({

    success: true,

    number: number,

    calledNumbers:
      game.calledNumbers,

    game:
      game

  });

});


// ========================================
// SERVER START
// ========================================

app.listen(PORT, () => {

  console.log(
    `🎱 Bingo Geda Multiplayer Server running on port ${PORT}`
  );

});
