import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

const PORT = 3000;
const STATS_FILE = path.join(process.cwd(), "stats.json");

// Ensure stats file exists
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify({ players: {} }));
}

interface PlayerStats {
  wins: number;
  losses: number;
}

interface GameState {
  board: (string | null)[][]; // 6 rows, 7 columns
  players: { id: string; name: string; color: string; symbol: "X" | "O" }[];
  currentTurn: number; // index of players array
  status: "waiting" | "playing" | "finished";
  winner: string | null;
  gameMode: "pvp" | "solo";
  winningLine: [number, number][] | null;
  turnStartTime: number | null;
  turnDuration: number;
  roomCode: string;
}

const rooms = new Map<string, GameState>();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  app.use(express.json());
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // AI Logic: Simple Heuristic
  function getAIMove(board: (string | null)[][], aiSymbol: string, humanSymbol: string): number {
    const validMoves = [];
    for (let c = 0; c < 7; c++) if (!board[0][c]) validMoves.push(c);
    
    // 1. Can AI win now?
    for (const c of validMoves) {
      const tempBoard = board.map(r => [...r]);
      const r = getLowestRow(tempBoard, c);
      tempBoard[r][c] = aiSymbol;
      if (checkWin(tempBoard, r, c, aiSymbol)) return c;
    }
    
    // 2. Can Human win now? (Block)
    for (const c of validMoves) {
      const tempBoard = board.map(r => [...r]);
      const r = getLowestRow(tempBoard, c);
      tempBoard[r][c] = humanSymbol;
      if (checkWin(tempBoard, r, c, humanSymbol)) return c;
    }
    
    // 3. Fallback: Prefer center
    if (validMoves.includes(3)) return 3;
    
    // 4. Random
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  function getLowestRow(board: (string | null)[][], col: number): number {
    for (let r = 5; r >= 0; r--) if (!board[r][col]) return r;
    return -1;
  }

  app.get("/api/leaderboard", (req, res) => {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
    const sorted = Object.entries(stats.players as Record<string, PlayerStats>)
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.wins - a.wins);
    res.json(sorted);
  });

  app.delete("/api/leaderboard", (req, res) => {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ players: {} }));
    res.json({ success: true });
  });

  function updateStats(winnerName: string, loserName: string) {
    if (winnerName === "CPU" || loserName === "CPU" || winnerName === "Draw") return;
    try {
      let stats = { players: {} };
      if (fs.existsSync(STATS_FILE)) {
        const content = fs.readFileSync(STATS_FILE, "utf-8");
        stats = JSON.parse(content || '{"players": {}}');
      }
      
      if (!stats.players) stats.players = {};
      if (!stats.players[winnerName]) stats.players[winnerName] = { wins: 0, losses: 0 };
      if (!stats.players[loserName]) stats.players[loserName] = { wins: 0, losses: 0 };
      
      stats.players[winnerName].wins += 1;
      stats.players[loserName].losses += 1;
      
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (err) {
      console.error("Critical error updating stats:", err);
    }
  }

  io.on("connection", (socket) => {
    socket.on("join-room", ({ roomCode, name, color, mode = "pvp" }) => {
      socket.join(roomCode);
      
      let room = rooms.get(roomCode);
      if (!room) {
        room = {
          board: Array(6).fill(null).map(() => Array(7).fill(null)),
          players: [],
          currentTurn: 0,
          status: "waiting",
          winner: null,
          gameMode: mode,
          winningLine: null,
          turnStartTime: null,
          turnDuration: 30,
          roomCode: roomCode,
        };
        rooms.set(roomCode, room);
      }

      if (room.players.length < 2) {
        const symbol = room.players.length === 0 ? "X" : "O";
        room.players.push({ id: socket.id, name, color, symbol });
        
        if (room.gameMode === "solo" && room.players.length === 1) {
          room.players.push({ id: "cpu", name: "AI", color: "#94a3b8", symbol: "O" });
          room.status = "playing"; // Auto-start solo games
          room.turnStartTime = Date.now();
        }
        
        io.to(roomCode).emit("room-update", room);
      } else {
        socket.emit("error", "Room is full");
      }
    });

    socket.on("start-game", (roomCode) => {
      const room = rooms.get(roomCode);
      if (room && room.players.length === 2) {
        room.status = "playing";
        room.turnStartTime = Date.now();
        io.to(roomCode).emit("room-update", room);
      }
    });

    socket.on("update-settings", ({ roomCode, turnDuration }) => {
      const room = rooms.get(roomCode);
      if (room && room.status === "waiting") {
        room.turnDuration = turnDuration;
        io.to(roomCode).emit("room-update", room);
      }
    });

    socket.on("make-move", ({ roomCode, colIndex }) => {
      const room = rooms.get(roomCode);
      if (!room || room.status !== "playing") return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== room.currentTurn) return;

      const rowIndex = getLowestRow(room.board, colIndex);
      if (rowIndex !== -1) {
        const currentSymbol = room.players[playerIndex].symbol;
        room.board[rowIndex][colIndex] = currentSymbol;
        
        const winLine = checkWin(room.board, rowIndex, colIndex, currentSymbol);
        if (winLine) {
          room.status = "finished";
          room.winner = room.players[playerIndex].name;
          room.winningLine = winLine;
          const loser = room.players[1 - playerIndex];
          updateStats(room.winner, loser.name);
          io.to(roomCode).emit("room-update", room);
          return;
        } else if (room.board.every(row => row.every(cell => cell !== null))) {
          room.status = "finished";
          room.winner = "Draw";
          io.to(roomCode).emit("room-update", room);
          return;
        }

        room.currentTurn = 1 - room.currentTurn;
        room.turnStartTime = Date.now();
        io.to(roomCode).emit("room-update", room);

        // Handle AI Move
        if (room.gameMode === "solo" && room.currentTurn === 1 && room.status === "playing") {
          setTimeout(() => {
            const aiMoveCol = getAIMove(room.board, "O", "X");
            const aiRow = getLowestRow(room.board, aiMoveCol);
            room.board[aiRow][aiMoveCol] = "O";
            
            const aiWinLine = checkWin(room.board, aiRow, aiMoveCol, "O");
            if (aiWinLine) {
              room.status = "finished";
              room.winner = "CPU";
              room.winningLine = aiWinLine;
              updateStats("CPU", room.players[0].name);
            } else if (room.board.every(row => row.every(cell => cell !== null))) {
              room.status = "finished";
              room.winner = "Draw";
            } else {
              room.currentTurn = 0;
              room.turnStartTime = Date.now();
            }
            io.to(roomCode).emit("room-update", room);
          }, 600);
        }
      }
    });

    socket.on("restart-game", (roomCode) => {
      const room = rooms.get(roomCode);
      if (room) {
        room.board = Array(6).fill(null).map(() => Array(7).fill(null));
        room.currentTurn = 0;
        room.status = "playing";
        room.winner = null;
        room.winningLine = null;
        room.turnStartTime = Date.now();
        io.to(roomCode).emit("room-update", room);
      }
    });

    socket.on("disconnect", () => {
      rooms.forEach((room, roomCode) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          room.status = "waiting";
          room.board = Array(6).fill(null).map(() => Array(7).fill(null));
          room.winner = null;
          room.winningLine = null;
          io.to(roomCode).emit("room-update", room);
          if (room.players.length === 0) rooms.delete(roomCode);
        }
      });
    });
  });

  // Server-side loop to enforce the turn timers
  setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, roomCode) => {
      if (room.status === "playing" && room.turnStartTime !== null && room.turnDuration > 0) {
        const elapsedSeconds = (now - room.turnStartTime) / 1000;
        if (elapsedSeconds >= room.turnDuration) {
          // Timer expired! Current player forfeits.
          room.status = "finished";
          room.winner = room.players[1 - room.currentTurn].name;
          room.winningLine = [];
          const loser = room.players[room.currentTurn];
          
          updateStats(room.winner, loser.name);
          io.to(roomCode).emit("room-update", room);
        }
      }
    });
  }, 1000);

  function checkWin(board: (string | null)[][], row: number, col: number, symbol: string): [number, number][] | null {
    const directions = [
      [0, 1], [1, 0], [1, 1], [1, -1]
    ];
    
    for (const [dr, dc] of directions) {
      let line: [number, number][] = [[row, col]];
      // Check forward
      for (let i = 1; i < 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) line.push([r, c]);
        else break;
      }
      // Check backward
      for (let i = 1; i < 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) line.push([r, c]);
        else break;
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
