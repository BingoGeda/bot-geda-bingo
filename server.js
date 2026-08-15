const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;


// ========================================
// SERVE MINI APP
// ========================================

app.use(express.static(__dirname));


// ========================================
// GAME ROOMS
// ========================================

const games = {};


// ========================================
// CREATE ROOM CODE
// ========================================

function generateRoomCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  do {

    code = "";

    for (let i = 0; i < 6; i++) {

      code +=
        chars[
          Math.floor(
            Math.random() * chars.length
          )
        ];

    }

  } while (games[code]);

  return code;
}


// ========================================
// SHUFFLE
// ========================================

function shuffle(array) {

  const result =
    [...array];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [
      result[i],
      result[j]
    ] =
    [
      result[j],
      result[i]
    ];

  }

  return result;
}


// ========================================
// CREATE BINGO CARD
// ========================================

function createBingoCard() {

  const columns = [

    shuffle(
      Array.from(
        { length: 15 },
        (_, i) => i + 1
      )
    ).slice(0, 5),

    shuffle(
      Array.from(
        { length: 15 },
        (_, i) => i + 16
      )
    ).slice(0, 5),

    shuffle(
      Array.from(
        { length: 15 },
        (_, i) => i + 31
      )
    ).slice(0, 5),

    shuffle(
      Array.from(
        { length: 15 },
        (_, i) => i + 46
      )
    ).slice(0, 5),

    shuffle(
      Array.from(
        { length: 15 },
        (_, i) => i + 61
      )
    ).slice(0, 5)

  ];


  const card = [];


  for (let row = 0; row < 5; row++) {

    for (
      let column = 0;
      column < 5;
      column++
    ) {

      if (
        row === 2 &&
        column === 2
      ) {

        card.push("FREE");

      } else {

        card.push(
          columns[column][row]
        );

      }

    }

  }


  return card;
}


// ========================================
// CREATE GAME
// ========================================

function createGame(
  hostUser
) {

  const roomCode =
    generateRoomCode();


  const hostId =
    String(
      hostUser.id ||
      "guest-" + Date.now()
    );


  const game = {

    id:
      Date.now().toString(),

    roomCode:

      roomCode,

    hostId:

      hostId,

    calledNumbers: [],

    status:
      "waiting",

    players: {},

    winner:
      null,

    createdAt:
      new Date().toISOString()

  };


  games[roomCode] =
    game;


  return game;
}


// ========================================
// GET GAME
// ========================================

function getGame(
  roomCode
) {

  if (!roomCode) {

    return null;

  }


  return games[
    String(roomCode)
      .trim()
      .toUpperCase()
  ] || null;

}


// ========================================
// ADD PLAYER
// ========================================

function addPlayer(
  game,
  user
) {

  const playerId =
    String(
      user.id ||
      "guest-" + Date.now()
    );


  if (
    game.players[playerId]
  ) {

    return game.players[playerId];

  }


  const player = {

    id:
      playerId,

    name:
      user.first_name ||
      "Guest",

    username:
      user.username ||
      "",

    card:
      createBingoCard(),

    markedNumbers: [],

    joinedAt:
      new Date().toISOString()

  };


  game.players[playerId] =
    player;


  if (
    Object.keys(
      game.players
    ).length > 0
  ) {

    game.status =
      "playing";

  }


  return player;
}


// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );

});


// ========================================
// HEALTH
// ========================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success:
        true,

      status:
        "OK",

      server:
        "Bingo Geda",

      time:
        new Date().toISOString()

    });

  }
);


// ========================================
// GET DEFAULT GAME
// ========================================

app.get(
  "/api/game",
  (req, res) => {

    const roomCode =
      req.query.room;

    let game;


    if (roomCode) {

      game =
        getGame(roomCode);

    } else {

      const rooms =
        Object.values(games);

      game =
        rooms.length
          ? rooms[rooms.length - 1]
          : null;

    }


    if (!game) {

      return res.status(404).json({

        success:
          false,

        message:
          "No active game."

      });

    }


    res.json({

      success:
        true,

      game:
        game

    });

  }
);


// ========================================
// CREATE GAME
// ========================================

app.post(
  "/api/game/create",
  (req, res) => {

    const user =
      req.body.user || {};


    const game =
      createGame(user);


    const player =
      addPlayer(
        game,
        user
      );


    res.json({

      success:
        true,

      message:
        "🎱 Bingo room created!",

      roomCode:
        game.roomCode,

      player:
        player,

      game:
        game

    });

  }
);


// ========================================
// JOIN BY ROOM CODE
// ========================================

app.post(
  "/api/game/join",
  (req, res) => {

    const roomCode =
      req.body.roomCode;


    const user =
      req.body.user || {};


    const game =
      getGame(roomCode);


    if (!game) {

      return res.status(404).json({

        success:
          false,

        message:
          "Room not found. Check the room code."

      });

    }


    if (
      game.status ===
      "finished"
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          "This game has finished."

      });

    }


    const player =
      addPlayer(
        game,
        user
      );


    res.json({

      success:
        true,

      message:
        "🎮 Joined Bingo Geda room!",

      roomCode:
        game.roomCode,

      player:
        player,

      game:
        game

    });

  }
);


// ========================================
// JOIN BY GAME ID
// ========================================

app.post(
  "/api/game/:id/join",
  (req, res) => {

    const user =
      req.body.user || {};


    const game =
      Object.values(games)
        .find(
          item =>
            item.id ===
            String(
              req.params.id
            )
        );


    if (!game) {

      return res.status(404).json({

        success:
          false,

        message:
          "Game not found."

      });

    }


    const player =
      addPlayer(
        game,
        user
      );


    res.json({

      success:
        true,

      message:
        "🎮 Player joined!",

      roomCode:
        game.roomCode,

      player:
        player,

      game:
        game

    });

  }
);


// ========================================
// GET GAME BY ID
// ========================================

app.get(
  "/api/game/:id",
  (req, res) => {

    const game =
      Object.values(games)
        .find(
          item =>
            item.id ===
            String(
              req.params.id
            )
        );


    if (!game) {

      return res.status(404).json({

        success:
          false,

        message:
          "Game not found."

      });

    }


    res.json({

      success:
        true,

      game:
        game

    });

  }
);


// ========================================
// CALL NEXT NUMBER
// ========================================

app.post(
  "/api/game/:id/call",
  (req, res) => {

    const game =
      Object.values(games)
        .find(
          item =>
            item.id ===
            String(
              req.params.id
            )
        );


    if (!game) {

      return res.status(404).json({

        success:
          false,

        message:
          "Game not found."

      });

    }


    const user =
      req.body.user || {};


    const callerId =
      String(
        user.id || ""
      );


    // Only host can call
    if (
      callerId &&
      callerId !==
      String(game.hostId)
    ) {

      return res.status(403).json({

        success:
          false,

        message:
          "Only the game host can call numbers."

      });

    }


    if (
      game.status ===
      "finished"
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          "Game is already finished."

      });

    }


    const available =
      Array.from(
        { length: 75 },
        (_, i) => i + 1
      )
      .filter(
        number =>
          !game.calledNumbers
            .includes(number)
      );


    if (
      available.length === 0
    ) {

      game.status =
        "finished";


      return res.json({

        success:
          false,

        message:
          "All numbers have been called.",

        game:
          game

      });

    }


    const number =
      available[
        Math.floor(
          Math.random() *
          available.length
        )
      ];


    game.calledNumbers.push(
      number
    );


    game.status =
      "playing";


    res.json({

      success:
        true,

      number:
        number,

      calledNumbers:
        game.calledNumbers,

      game:
        game

    });

  }
);


// ========================================
// MARK NUMBER
// ========================================

app.post(
  "/api/game/:id/mark",
  (req, res) => {

    const game =
      Object.values(games)
        .find(
          item =>
            item.id ===
            String(
              req.params.id
            )
        );


    if (!game) {

      return res.status(404).json({

        success:
          false,

        message:
          "Game not found."

      });

    }


    const user =
      req.body.user || {};


    const number =
      req.body.number;


    const playerId =
      String(
        user.id || ""
      );


    const player =
      game.players[playerId];


    if (!player) {

      return res.status(404).json({

        success:
          false,

        message:
          "Player is not in this game."

      });

    }


    if (
      number !==
      "FREE" &&
      !game.calledNumbers
        .includes(
          Number(number)
        )
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          "That number has not been called yet."

      });

    }


    if (
      !player.markedNumbers
        .includes(number)
    ) {

      player.markedNumbers.push(
        number
      );

    }


    res.json({

      success:
        true,

      markedNumbers:
        player.markedNumbers,

      player:
        player,

      game:
        game

    });

  }
);


// ========================================
// START NEW GAME
// ========================================

app.post(
  "/api/game/new",
  (req, res) => {

    const user =
      req.body.user || {};


    const game =
      createGame(user);


    const player =
      addPlayer(
        game,
        user
      );


    res.json({

      success:
        true,

      roomCode:
        game.roomCode,

      player:
        player,

      game:
        game

    });

  }
);


// ========================================
// SERVER START
// ========================================

app.listen(
  PORT,
  ()
