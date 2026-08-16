const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ======================================
// POSTGRESQL
// ======================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      called_numbers INTEGER[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT NOT NULL,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, game_id)
    );
  `);

  console.log("✅ PostgreSQL database initialized");
}

// ======================================
// STATIC MINI APP
// ======================================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// ======================================
// HELPERS
// ======================================

async function createNewGame() {
  const id = Date.now().toString();

  await pool.query(
    `
    INSERT INTO games
      (id, called_numbers, status)
    VALUES
      ($1, '{}', 'waiting')
    `,
    [id]
  );

  return getGame(id);
}

async function getGame(gameId) {
  const gameResult = await pool.query(
    `
    SELECT
      id,
      called_numbers,
      status,
      created_at
    FROM games
    WHERE id = $1
    `,
    [gameId]
  );

  if (gameResult.rows.length === 0) {
    return null;
  }

  const row = gameResult.rows[0];

  const playersResult = await pool.query(
    `
    SELECT
      id,
      name,
      joined_at
    FROM players
    WHERE game_id = $1
    ORDER BY joined_at ASC
    `,
    [gameId]
  );

  const players = {};

  playersResult.rows.forEach(player => {
    players[player.id] = {
      id: player.id,
      name: player.name,
      joinedAt: player.joined_at
    };
  });

  return {
    id: row.id,
    calledNumbers: row.called_numbers || [],
    status: row.status,
    players,
    createdAt: row.created_at
  };
}

// ======================================
// HEALTH
// ======================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      status: "OK",
      server: "Bingo Geda",
      database: "connected",
      time: new Date().toISOString()
    });

  } catch (error) {

    console.error("DATABASE ERROR:", error);

    res.status(500).json({
      success: false,
      status: "ERROR",
      server: "Bingo Geda",
      database: "disconnected"
    });
  }
});

// ======================================
// CURRENT GAME
// ======================================

app.get("/api/game", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT id
      FROM games
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {

      const newGame = await createNewGame();

      return res.json({
        success: true,
        game: newGame
      });
    }

    const game = await getGame(result.rows[0].id);

    res.json({
      success: true,
      game
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not load game."
    });
  }
});

// ======================================
// CREATE NEW GAME
// ======================================

app.post("/api/game/new", async (req, res) => {

  try {

    const game = await createNewGame();

    console.log("🎱 New game:", game.id);

    res.json({
      success: true,
      message: "New Bingo game created!",
      game
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not create game."
    });
  }
});

// ======================================
// JOIN GAME
// ======================================

app.post("/api/game/join", async (req, res) => {

  try {

    const gameId = String(req.body.gameId || "");

    const playerId = String(
      req.body.playerId ||
      "player_" + Date.now()
    );

    const playerName =
      String(req.body.name || "Player");

    if (!gameId) {

      return res.status(400).json({
        success: false,
        message: "Game ID is required."
      });
    }

    const game = await getGame(gameId);

    if (!game) {

      return res.status(404).json({
        success: false,
        message: "Game not found.",
        gameId
      });
    }

    await pool.query(
      `
      INSERT INTO players
        (id, game_id, name)
      VALUES
        ($1, $2, $3)
      ON CONFLICT (id, game_id)
      DO UPDATE SET name = EXCLUDED.name
      `,
      [playerId, gameId, playerName]
    );

    await pool.query(
      `
      UPDATE games
      SET status = 'playing'
      WHERE id = $1
      `,
      [gameId]
    );

    const updatedGame = await getGame(gameId);

    console.log(
      `👤 ${playerName} joined ${gameId}`
    );

    res.json({
      success: true,
      message: "Player joined Bingo Geda!",
      game: updatedGame
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not join game."
    });
  }
});

// ======================================
// CALL NUMBER
// ======================================

app.post("/api/game/call", async (req, res) => {

  try {

    const gameId = String(req.body.gameId || "");

    if (!gameId) {

      return res.status(400).json({
        success: false,
        message: "Game ID is required."
      });
    }

    const game = await getGame(gameId);

    if (!game) {

      return res.status(404).json({
        success: false,
        message: "Game not found."
      });
    }

    if (game.status === "finished") {

      return res.status(400).json({
        success: false,
        message: "Game is already finished.",
        game
      });
    }

    const allNumbers =
      Array.from(
        { length: 75 },
        (_, i) => i + 1
      );

    const available =
      allNumbers.filter(
        number =>
          !game.calledNumbers.includes(number)
      );

    if (available.length === 0) {

      await pool.query(
        `
        UPDATE games
        SET status = 'finished'
        WHERE id = $1
        `,
        [gameId]
      );

      return res.json({
        success: false,
        message: "All Bingo numbers have been called."
      });
    }

    const number =
      available[
        Math.floor(
          Math.random() * available.length
        )
      ];

    const newNumbers = [
      ...game.calledNumbers,
      number
    ];

    await pool.query(
      `
      UPDATE games
      SET
        called_numbers = $1,
        status = 'playing'
      WHERE id = $2
      `,
      [newNumbers, gameId]
    );

    const updatedGame =
      await getGame(gameId);

    console.log(
      `🔢 ${number} called in ${gameId}`
    );

    res.json({
      success: true,
      number,
      calledNumbers: newNumbers,
      game: updatedGame
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not call number."
    });
  }
});

// ======================================
// CALLED NUMBERS
// ======================================

app.get("/api/game/numbers", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT called_numbers
      FROM games
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const numbers =
      result.rows[0]?.called_numbers || [];

    res.json({
      success: true,
      calledNumbers: numbers
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not load numbers."
    });
  }
});

// ======================================
// LEAVE GAME
// ======================================

app.post("/api/game/leave", async (req, res) => {

  try {

    const playerId =
      String(req.body.playerId || "");

    const gameId =
      String(req.body.gameId || "");

    if (playerId && gameId) {

      await pool.query(
        `
        DELETE FROM players
        WHERE id = $1
        AND game_id = $2
        `,
        [playerId, gameId]
      );
    }

    const game = await getGame(gameId);

    if (game && Object.keys(game.players).length === 0) {

      await pool.query(
        `
        UPDATE games
        SET status = 'waiting'
        WHERE id = $1
        `,
        [gameId]
      );
    }

    res.json({
      success: true,
      message: "Player left the game.",
      game
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not leave game."
    });
  }
});

// ======================================
// GAME STATUS
// ======================================

app.get("/api/game/status", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        id,
        status,
        called_numbers
      FROM games
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {

      return res.json({
        success: true,
        status: "waiting",
        players: 0,
        calledNumbers: 0,
        gameId: null
      });
    }

    const row = result.rows[0];

    const players =
      await pool.query(
        `
        SELECT COUNT(*)
        FROM players
        WHERE game_id = $1
        `,
        [row.id]
      );

    res.json({
      success: true,
      status: row.status,
      players: Number(players.rows[0].count),
      calledNumbers:
        (row.called_numbers || []).length,
      gameId: row.id
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not load status."
    });
  }
});

// ======================================
// RESET
// ======================================

app.post("/api/game/reset", async (req, res) => {

  try {

    await pool.query("DELETE FROM games");

    const game = await createNewGame();

    res.json({
      success: true,
      message: "Game reset.",
      game
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not reset game."
    });
  }
});

// ======================================
// 404
// ======================================

app.use("/api", (req, res) => {

  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });

});

// ======================================
// START SERVER
// ======================================

async function startServer() {

  try {

    await initDatabase();

    app.listen(PORT, () => {

      console.log(
        `🎱 Bingo Geda server running on port ${PORT}`
      );

    });

  } catch (error) {

    console.error(
      "❌ DATABASE STARTUP ERROR:",
      error
    );

    process.exit(1);
  }
}

startServer();
