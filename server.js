const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

// ======================================
// PORT
// ======================================

const PORT = process.env.PORT || 10000;

// ======================================
// POSTGRESQL
// ======================================

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err);
});

// ======================================
// SERVE MINI APP
// ======================================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ======================================
// DATABASE SETUP
// ======================================

async function setupDatabase() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT NOT NULL,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Player',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, game_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS called_numbers (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      number INTEGER NOT NULL CHECK (number >= 1 AND number <= 75),
      called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (game_id, number)
    );
  `);

  // Create first game if none exists
  const result = await pool.query(`
    SELECT id
    FROM games
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {

    const id = Date.now().toString();

    await pool.query(
      `
      INSERT INTO games (id, status)
      VALUES ($1, 'waiting')
      `,
      [id]
    );

    console.log("🎱 First Bingo game created:", id);
  }

  console.log("✅ PostgreSQL database ready.");
}

// ======================================
// GET FULL GAME
// ======================================

async function getGame(gameId) {

  const gameResult = await pool.query(
    `
    SELECT
      id,
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

  const gameRow = gameResult.rows[0];

  // Players
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

  for (const player of playersResult.rows) {

    players[player.id] = {
      id: player.id,
      name: player.name,
      joinedAt: player.joined_at
    };

  }

  // Called numbers
  const numbersResult = await pool.query(
    `
    SELECT number
    FROM called_numbers
    WHERE game_id = $1
    ORDER BY called_at ASC
    `,
    [gameId]
  );

  const calledNumbers =
    numbersResult.rows.map(row => row.number);

  return {
    id: gameRow.id,
    calledNumbers,
    status: gameRow.status,
    players,
    createdAt: gameRow.created_at
  };
}

// ======================================
// GET CURRENT GAME
// ======================================

async function getCurrentGame() {

  const result = await pool.query(`
    SELECT id
    FROM games
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return getGame(result.rows[0].id);
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

    console.error("HEALTH ERROR:", error);

    res.status(500).json({
      success: false,
      status: "ERROR",
      server: "Bingo Geda",
      database: "disconnected"
    });

  }

});

// ======================================
// GET CURRENT GAME
// ======================================

app.get("/api/game", async (req, res) => {

  try {

    const game = await getCurrentGame();

    if (!game) {

      return res.status(404).json({
        success: false,
        message: "No Bingo game exists."
      });

    }

    res.json({
      success: true,
      game
    });

  } catch (error) {

    console.error("GET GAME ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Database error."
    });

  }

});

// ======================================
// CREATE NEW GAME
// ======================================

app.post("/api/game/new", async (req, res) => {

  try {

    const id = Date.now().toString();

    await pool.query(
      `
      INSERT INTO games (id, status)
      VALUES ($1, 'waiting')
      `,
      [id]
    );

    const game = await getGame(id);

    console.log("🎱 New game created:", id);

    res.status(201).json({
      success: true,
      message: "New Bingo game created!",
      game
    });

  } catch (error) {

    console.error("CREATE GAME ERROR:", error);

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

    const gameId =
      String(req.body.gameId || "");

    const playerId =
      String(
        req.body.playerId ||
        "player_" + Date.now()
      );

    const playerName =
      String(
        req.body.name ||
        "Player"
      );

    if (!gameId) {

      return res.status(400).json({
        success: false,
        message: "Game ID is required."
      });

    }

    // Check game
    const gameResult = await pool.query(
      `
      SELECT id
      FROM games
      WHERE id = $1
      `,
      [gameId]
    );

    if (gameResult.rows.length === 0) {

      return res.status(404).json({
        success: false,
        message: "Game not found.",
        gameId
      });

    }

    // Add player
    await pool.query(
      `
      INSERT INTO players
        (id, game_id, name)
      VALUES
        ($1, $2, $3)
      ON CONFLICT (id, game_id)
      DO UPDATE SET name = EXCLUDED.name
      `,
      [
        playerId,
        gameId,
        playerName
      ]
    );

    // Set playing
    await pool.query(
      `
      UPDATE games
      SET status = 'playing'
      WHERE id = $1
      `,
      [gameId]
    );

    const game =
      await getGame(gameId);

    console.log(
      `👤 ${playerName} joined game ${gameId}`
    );

    res.json({
      success: true,
      message: "Player joined Bingo Geda!",
      player: game.players[playerId],
      game
    });

  } catch (error) {

    console.error("JOIN GAME ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Could not join game."
    });

  }

});

// ======================================
// CALL NEXT BINGO NUMBER
// ======================================

app.post("/api/game/call", async (req, res) => {

  const client = await pool.connect();

  try {

    const gameId =
      String(req.body.gameId || "");

    if (!gameId) {

      return res.status(400).json({
        success: false,
        message: "Game ID is required."
      });

    }

    await client.query("BEGIN");

    // Check game
    const gameResult =
      await client.query(
        `
        SELECT id, status
        FROM games
        WHERE id = $1
        FOR UPDATE
        `,
        [gameId]
      );

    if (gameResult.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Game not found."
      });

    }

    const gameRow =
      gameResult.rows[0];

    if (gameRow.status === "finished") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Game is already finished."
      });

    }

    // Get called numbers
    const calledResult =
      await client.query(
        `
        SELECT number
        FROM called_numbers
        WHERE game_id = $1
        `,
        [gameId]
      );

    const calledNumbers =
      calledResult.rows.map(
        row => Number(row.number)
      );

    // Available numbers
    const availableNumbers =
      Array.from(
        { length: 75 },
        (_, i) => i + 1
      ).filter(
        number =>
          !calledNumbers.includes(number)
      );

    // All numbers called
    if (availableNumbers.length === 0) {

      await client.query(
        `
        UPDATE games
        SET status = 'finished'
        WHERE id = $1
        `,
        [gameId]
      );

      await client.query("COMMIT");

      const game =
        await getGame(gameId);

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

    // Save number
    await client.query(
      `
      INSERT INTO called_numbers
        (game_id, number)
      VALUES
        ($1, $2)
      `,
      [gameId, number]
    );

    // Set playing
    await client.query(
      `
      UPDATE games
      SET status = 'playing'
      WHERE id = $1
      `,
      [gameId]
    );

    await client.query("COMMIT");

    const game =
      await getGame(gameId);

    console.log(
      `🔢 Game ${gameId}: Number called ${number}`
    );

    res.json({
      success: true,
      number,
      calledNumbers: game.calledNumbers,
      game
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(
      "CALL NUMBER ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Could not call number."
    });

  } finally {

    client.release();

  }

});

// ======================================
// GET CALLED NUMBERS
// ======================================

app.get("/api/game/numbers", async (req, res) => {

  try {

    const game =
      await getCurrentGame();

    if (!game) {

      return res.status(404).json({
        success: false,
        message: "No game found."
      });

    }

    res.json({
      success: true,
      calledNumbers: game.calledNumbers
    });

  } catch (error) {

    console.error(
      "NUMBERS ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Database error."
    });

  }

});

// ======================================
// LEAVE GAME
// ======================================

app.post("/api/game/leave", async (req, res) => {

  try {

    const gameId =
      String(req.body.gameId || "");

    const playerId =
      String(req.body.playerId || "");

    if (!gameId || !playerId) {

      return res.status(400).json({
        success: false,
        message:
          "Game ID and Player ID are required."
      });

    }

    await pool.query(
      `
      DELETE FROM players
      WHERE game_id = $1
      AND id = $2
      `,
      [
        gameId,
        playerId
      ]
    );

    // Count players
    const countResult =
      await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM players
        WHERE game_id = $1
        `,
        [gameId]
      );

    const playerCount =
      countResult.rows[0].count;

    if (playerCount === 0) {

      await pool.query(
        `
        UPDATE games
        SET status = 'waiting'
        WHERE id = $1
        AND status != 'finished'
        `,
        [gameId]
      );

    }

    const game =
      await getGame(gameId);

    res.json({
      success: true,
      message: "Player left the game.",
      game
    });

  } catch (error) {

    console.error(
      "LEAVE GAME ERROR:",
      error
    );

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

    const game =
      await getCurrentGame();

    if (!game) {

      return res.status(404).json({
        success: false,
        message: "No game found."
      });

    }

    res.json({
      success: true,
      status: game.status,
      players:
        Object.keys(game.players).length,
      calledNumbers:
        game.calledNumbers.length,
      gameId: game.id
    });

  } catch (error) {

    console.error(
      "STATUS ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Database error."
    });

  }

});

// ======================================
// RESET / CREATE NEW GAME
// ======================================

app.post("/api/game/reset", async (req, res) => {

  try {

    const id =
      Date.now().toString();

    await pool.query(
      `
      INSERT INTO games
        (id, status)
      VALUES
        ($1, 'waiting')
      `,
      [id]
    );

    const game =
      await getGame(id);

    res.json({
      success: true,
      message: "Game reset.",
      game
    });

  } catch (error) {

    console.error(
      "RESET ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Could not reset game."
    });

  }

});

// ======================================
// API 404
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

    await setupDatabase();

    app.listen(PORT, () => {

      console.log(
        `🎱 Bingo Geda server running on port ${PORT}`
      );

      console.log(
        `🌐 Port: ${PORT}`
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
