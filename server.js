const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =====================================================
   STATIC MINI APP
===================================================== */

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =====================================================
   DATABASE
===================================================== */

let pool = null;
let databaseConnected = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.connect()
    .then(client => {
      databaseConnected = true;
      console.log("✅ PostgreSQL connected");
      client.release();
    })
    .catch(error => {
      databaseConnected = false;
      console.error(
        "❌ PostgreSQL connection failed:",
        error.message
      );
    });
}

/* =====================================================
   GAME
===================================================== */

let game = createNewGame();
let autoCallTimer = null;

const AUTO_CALL_SECONDS = 5;

function createNewGame(controllerId = null, controllerName = "Controller") {
  return {
    id: Date.now().toString(),
    status: "waiting",

    controllerId,
    controllerName,

    players: {},

    calledNumbers: [],

    autoCall: false,

    createdAt: new Date().toISOString()
  };
}

/* =====================================================
   HTTP + WEBSOCKET SERVER
===================================================== */

const server = http.createServer(app);

const wss = new WebSocketServer({
  server
});

/* =====================================================
   WEBSOCKET BROADCAST
===================================================== */

function broadcast(data) {
  const message = JSON.stringify(data);

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      try {
        client.send(message);
      } catch (error) {
        console.error(
          "WebSocket send error:",
          error.message
        );
      }
    }
  });
}

wss.on("connection", ws => {
  console.log("🔌 WebSocket connected");

  ws.send(
    JSON.stringify({
      type: "GAME_STATE",
      game
    })
  );

  ws.on("close", () => {
    console.log("🔌 WebSocket disconnected");
  });
});

/* =====================================================
   BINGO LETTER
===================================================== */

function getBingoLetter(number) {
  if (number >= 1 && number <= 15) {
    return "B";
  }

  if (number >= 16 && number <= 30) {
    return "I";
  }

  if (number >= 31 && number <= 45) {
    return "N";
  }

  if (number >= 46 && number <= 60) {
    return "G";
  }

  return "O";
}

/* =====================================================
   DATABASE TABLE
===================================================== */

async function initializeDatabase() {
  if (!pool) {
    console.log("⚠️ DATABASE_URL not found");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bingo_games (
        id TEXT PRIMARY KEY,
        controller_id TEXT,
        controller_name TEXT,
        status TEXT,
        called_numbers JSONB NOT NULL DEFAULT '[]',
        players JSONB NOT NULL DEFAULT '{}',
        auto_call BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL
      )
    `);

    console.log("✅ Database table ready");
  } catch (error) {
    console.error(
      "❌ Database initialization error:",
      error.message
    );
  }
}

/* =====================================================
   SAVE GAME
===================================================== */

async function saveGame() {
  if (!pool) {
    return;
  }

  try {
    await pool.query(
      `
      INSERT INTO bingo_games
      (
        id,
        controller_id,
        controller_name,
        status,
        called_numbers,
        players,
        auto_call,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)

      ON CONFLICT (id)

      DO UPDATE SET
        controller_id = EXCLUDED.controller_id,
        controller_name = EXCLUDED.controller_name,
        status = EXCLUDED.status,
        called_numbers = EXCLUDED.called_numbers,
        players = EXCLUDED.players,
        auto_call = EXCLUDED.auto_call
      `,
      [
        game.id,
        game.controllerId,
        game.controllerName,
        game.status,
        JSON.stringify(game.calledNumbers),
        JSON.stringify(game.players),
        game.autoCall,
        game.createdAt
      ]
    );
  } catch (error) {
    console.error(
      "❌ DATABASE SAVE ERROR:",
      error.message
    );
  }
}

/* =====================================================
   HEALTH
===================================================== */

app.get("/api/health", async (req, res) => {
  let database = databaseConnected
    ? "connected"
    : "not connected";

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
      databaseConnected = true;
    } catch {
      database = "not connected";
      databaseConnected = false;
    }
  }

  res.json({
    success: true,
    status: "OK",
    server: "Bingo Geda",
    database,
    websocket: "enabled",
    time: new Date().toISOString()
  });
});

/* =====================================================
   GET GAME
===================================================== */

app.get("/api/game", (req, res) => {
  res.json({
    success: true,
    game
  });
});

/* =====================================================
   CREATE GAME
   CONTROLLER ONLY
===================================================== */

app.post("/api/game/new", async (req, res) => {
  const controllerId = String(
    req.body.controllerId || ""
  );

  const controllerName = String(
    req.body.controllerName || "Controller"
  );

  if (!controllerId) {
    return res.status(400).json({
      success: false,
      message: "Controller ID is required."
    });
  }

  stopAutoCall();

  game = createNewGame(
    controllerId,
    controllerName
  );

  game.players[controllerId] = {
    id: controllerId,
    name: controllerName,
    role: "controller",
    joinedAt: new Date().toISOString()
  };

  await saveGame();

  broadcast({
    type: "GAME_CREATED",
    game
  });

  console.log(
    `🎱 Game created: ${game.id}`
  );

  console.log(
    `👑 Controller: ${controllerName}`
  );

  res.json({
    success: true,
    message: "Bingo game created.",
    role: "controller",
    game
  });
});

/* =====================================================
   JOIN GAME
   PLAYER ONLY
===================================================== */

app.post("/api/game/join", async (req, res) => {
  const gameId = String(
    req.body.gameId || ""
  );

  const playerId = String(
    req.body.playerId || ""
  );

  const playerName = String(
    req.body.name || "Player"
  );

  if (!gameId) {
    return res.status(400).json({
      success: false,
      message: "Game ID is required."
    });
  }

  if (gameId !== game.id) {
    return res.status(404).json({
      success: false,
      message: "Game not found."
    });
  }

  if (!playerId) {
    return res.status(400).json({
      success: false,
      message: "Player ID is required."
    });
  }

  /* Controller */

  if (playerId === game.controllerId) {
    return res.json({
      success: true,
      message: "You are the controller.",
      role: "controller",
      player: game.players[playerId],
      game
    });
  }

  /* Existing player */

  if (!game.players[playerId]) {
    game.players[playerId] = {
      id: playerId,
      name: playerName,
      role: "player",
      joinedAt: new Date().toISOString()
    };
  }

  game.status = "playing";

  await saveGame();

  broadcast({
    type: "PLAYER_JOINED",
    player: game.players[playerId],
    game
  });

  console.log(
    `👤 ${playerName} joined game ${game.id}`
  );

  res.json({
    success: true,
    message: "Player joined Bingo Geda.",
    role: "player",
    player: game.players[playerId],
    game
  });
});

/* =====================================================
   CALL NUMBER
===================================================== */

async function callNumber() {
  if (game.status === "finished") {
    return {
      success: false,
      message: "Game is finished.",
      game
    };
  }

  const allNumbers = Array.from(
    { length: 75 },
    (_, i) => i + 1
  );

  const available = allNumbers.filter(
    number =>
      !game.calledNumbers.includes(number)
  );

  if (available.length === 0) {
    game.status = "finished";

    stopAutoCall();

    await saveGame();

    broadcast({
      type: "GAME_FINISHED",
      game
    });

    return {
      success: false,
      message: "All numbers have been called.",
      game
    };
  }

  const randomIndex = Math.floor(
    Math.random() * available.length
  );

  const number = available[randomIndex];

  const letter = getBingoLetter(number);

  game.calledNumbers.push(number);

  game.status = "playing";

  await saveGame();

  const event = {
    type: "NUMBER_CALLED",

    number,

    letter,

    text: `${letter} ${number}`,

    calledNumbers:
      game.calledNumbers,

    game
  };

  broadcast(event);

  console.log(
    `🔊 ${letter} ${number}`
  );

  return {
    success: true,
    number,
    letter,
    text: `${letter} ${number}`,
    game
  };
}

/* =====================================================
   MANUAL CALL
   CONTROLLER ONLY
===================================================== */

app.post("/api/game/call", async (req, res) => {
  const controllerId = String(
    req.body.controllerId || ""
  );

  if (
    controllerId !== game.controllerId
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Only the controller can call numbers."
    });
  }

  const result = await callNumber();

  res.json(result);
});

/* =====================================================
   AUTO CALL
===================================================== */

function startAutoCall() {
  stopAutoCall();

  game.autoCall = true;

  autoCallTimer = setInterval(async () => {
    if (
      game.autoCall &&
      game.status !== "finished"
    ) {
      await callNumber();
    }
  }, AUTO_CALL_SECONDS * 1000);

  console.log(
    "▶️ Auto Call started"
  );
}

function stopAutoCall() {
  if (autoCallTimer) {
    clearInterval(autoCallTimer);
    autoCallTimer = null;
  }

  game.autoCall = false;
}

/* =====================================================
   AUTO CALL API
===================================================== */

app.post(
  "/api/game/auto-call",
  async (req, res) => {
    const controllerId = String(
      req.body.controllerId || ""
    );

    if (
      controllerId !== game.controllerId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only the controller can control Auto Call."
      });
    }

    const enabled =
      req.body.enabled === true;

    if (enabled) {
      startAutoCall();
    } else {
      stopAutoCall();
    }

    await saveGame();

    broadcast({
      type: "AUTO_CALL_CHANGED",
      enabled,
      game
    });

    res.json({
      success: true,
      enabled,
      game
    });
  }
);

/* =====================================================
   CALLED NUMBERS
===================================================== */

app.get(
  "/api/game/numbers",
  (req, res) => {
    res.json({
      success: true,
      calledNumbers:
        game.calledNumbers,
      lastNumber:
        game.calledNumbers.length
          ? game.calledNumbers[
              game.calledNumbers.length - 1
            ]
          : null
    });
  }
);

/* =====================================================
   GAME STATUS
===================================================== */

app.get(
  "/api/game/status",
  (req, res) => {
    res.json({
      success: true,

      gameId:
        game.id,

      status:
        game.status,

      controller:
        game.controllerName,

      players:
        Object.keys(game.players).length,

      calledNumbers:
        game.calledNumbers.length,

      autoCall:
        game.autoCall
    });
  }
);

/* =====================================================
   LEAVE GAME
===================================================== */

app.post(
  "/api/game/leave",
  async (req, res) => {
    const playerId = String(
      req.body.playerId || ""
    );

    if (
      playerId === game.controllerId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Controller cannot leave the game."
      });
    }

    if (game.players[playerId]) {
      delete game.players[playerId];
    }

    const playerCount =
      Object.keys(game.players).filter(
        id => id !== game.controllerId
      ).length;

    if (playerCount === 0) {
      game.status = "waiting";
    }

    await saveGame();

    broadcast({
      type: "PLAYER_LEFT",
      playerId,
      game
    });

    res.json({
      success: true,
      game
    });
  }
);

/* =====================================================
   RESET GAME
   CONTROLLER ONLY
===================================================== */

app.post(
  "/api/game/reset",
  async (req, res) => {
    const controllerId = String(
      req.body.controllerId || ""
    );

    if (
      controllerId !== game.controllerId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only the controller can reset the game."
      });
    }

    stopAutoCall();

    const controllerName =
      game.controllerName;

    game = createNewGame(
      controllerId,
      controllerName
    );

    game.players[controllerId] = {
      id: controllerId,
      name: controllerName,
      role: "controller",
      joinedAt: new Date().toISOString()
    };

    await saveGame();

    broadcast({
      type: "GAME_RESET",
      game
    });

    res.json({
      success: true,
      game
    });
  }
);

/* =====================================================
   404
===================================================== */

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      success: false,
      message:
        "API endpoint not found."
    });
  }
);

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
  await initializeDatabase();

  server.listen(PORT, () => {
    console.log(
      `🎱 Bingo Geda Server running on port ${PORT}`
    );

    console.log(
      `🔌 WebSocket enabled`
    );
  });
}

startServer();
