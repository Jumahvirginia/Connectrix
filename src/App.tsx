import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Trophy, 
  Users, 
  Play, 
  LogOut, 
  Moon, 
  Sun, 
  ChevronRight,
  Medal,
  RefreshCw,
  ArrowLeft,
  CircleDot,
  Settings as SettingsIcon,
  Copy,
  Check,
  User,
  Volume2,
  VolumeX,
  Trash2,
  LayoutGrid,
  Timer,
  Zap,
  ChevronDown
} from "lucide-react";
import socket from "./lib/socket";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Player {
  id: string;
  name: string;
  color: string;
  symbol: "X" | "O";
}

interface GameState {
  board: (string | null)[][];
  players: Player[];
  currentTurn: number;
  status: "waiting" | "playing" | "finished";
  winner: string | null;
  gameMode: "pvp" | "solo";
  winningLine: [number, number][] | null;
  turnStartTime: number | null;
  turnDuration: number;
  roomCode: string;
}

interface Stat {
  name: string;
  wins: number;
  losses: number;
}

const ACCENT_COLORS = [
  { name: "Blue", hex: "#3B82F6" },
  { name: "Green", hex: "#10B981" },
  { name: "Violet", hex: "#8B5CF6" },
  { name: "Rose", hex: "#F43F5E" },
  { name: "Cyan", hex: "#06B6D4" }
];

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [view, setView] = useState<"landing" | "setup" | "room" | "game" | "leaderboard" | "settings">("landing");
  const [gameMode, setGameMode] = useState<"pvp" | "solo">("pvp");
  const [roomAction, setRoomAction] = useState<"create" | "join" | null>(null);
  
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("");
  const [selectedColor, setSelectedColor] = useState(ACCENT_COLORS[0].hex);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [leaderboard, setLeaderboard] = useState<Stat[]>([]);
  const [hasCopied, setHasCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [preferredTurnDuration, setPreferredTurnDuration] = useState(30);
  const [myId, setMyId] = useState<string | null>(socket.id || null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("room");
    if (joinCode) {
      setRoomCode(joinCode.toUpperCase());
      setRoomAction("join");
      setView("setup");
    }
  }, []);

  useEffect(() => {
    const handleConnect = () => setMyId(socket.id || null);
    socket.on("connect", handleConnect);
    // If already connected, set ID
    if (socket.connected) handleConnect();
    return () => { socket.off("connect", handleConnect); };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState?.status === "playing" && gameState.turnStartTime) {
      const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - gameState.turnStartTime!) / 1000);
        const remaining = Math.max(0, gameState.turnDuration - elapsed);
        setTimeLeft(remaining);
      };
      updateTimer();
      timer = setInterval(updateTimer, 500);
    }
    return () => clearInterval(timer);
  }, [gameState?.status, gameState?.turnStartTime, gameState?.turnDuration]);

  useEffect(() => {
    socket.on("room-update", (updatedState: GameState) => {
      setGameState(updatedState);
      if (updatedState.status === "playing") setView("game");
      else if (updatedState.status === "waiting") setView("room");
      setPreferredTurnDuration(updatedState.turnDuration);

      // Sync color from server (in case of auto-correction)
      const me = updatedState.players.find(p => p.id === (socket.id || myId));
      if (me && me.color !== selectedColor) {
        setSelectedColor(me.color);
      }
    });

    socket.on("error", (msg: string) => {
      alert(msg);
    });

    return () => {
      socket.off("room-update");
      socket.off("error");
    };
  }, []);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars like 0, O, 1, I
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleJoin = () => {
    if (!username || (gameMode === "pvp" && !roomCode)) return;
    const finalRoomCode = gameMode === "solo" ? `SOLO-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : roomCode.toUpperCase();
    socket.emit("join-room", { roomCode: finalRoomCode, name: username, color: selectedColor, mode: gameMode });
  };

  const handleCreate = () => {
    if (!username) return;
    const newCode = generateRoomCode();
    setRoomCode(newCode);
    socket.emit("join-room", { roomCode: newCode, name: username, color: selectedColor, mode: gameMode });
    // After joining, if we are the first one, we can update settings
    setTimeout(() => {
        socket.emit("update-settings", { roomCode: newCode, turnDuration: preferredTurnDuration });
    }, 500);
  };

  const handleUpdateColor = (color: string) => {
    setSelectedColor(color);
    socket.emit("update-color", { roomCode, color });
  };

  const currentOpponent = gameState?.players.find(p => p.id !== socket.id);
  const takenColor = currentOpponent?.color;

  const handleExit = () => {
    if (roomCode) {
      socket.emit("leave-room", roomCode);
    }
    setView("landing");
    setGameState(null);
  };

  const copyToClipboard = () => {
    if (!roomCode) return;
    
    const doCopy = (text: string) => {
      // Modern API
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      // Fallback
      return new Promise<void>((resolve, reject) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          const successful = document.execCommand('copy');
          if (successful) resolve();
          else reject(new Error('ExecCommand copy failed'));
        } catch (err) {
          reject(err);
        }
        document.body.removeChild(textArea);
      });
    };

    doCopy(roomCode).then(() => {
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }).catch(err => {
      console.error("Copy failed:", err);
    });
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      setLeaderboard(data);
      setView("leaderboard");
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetStats = async () => {
    if (confirm("Reset all statistics? This cannot be undone.")) {
      try {
        await fetch("/api/leaderboard", { method: "DELETE" });
        setLeaderboard([]);
        alert("Statistics have been reset.");
      } catch (err) {
        console.error(err);
        alert("Failed to reset statistics.");
      }
    }
  };

  const cardClass = isDarkMode ? "premium-card-dark" : "premium-card-light";
  const slotInnerClass = isDarkMode ? "slot-inner-dark" : "slot-inner-light";
  const inputClass = isDarkMode ? "bg-charcoal-bg border-charcoal-border text-white" : "bg-slate-50 border-slate-200 text-slate-900";

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500 font-sans",
      isDarkMode ? "bg-charcoal-bg text-slate-200" : "bg-light-bg text-slate-900"
    )}>
      {/* Header */}
      <nav className="fixed top-0 w-full z-50 p-6 md:px-12 flex justify-between items-center bg-transparent backdrop-blur-sm">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={handleExit}
        >
          <LayoutGrid className={cn("w-7 h-7", isDarkMode ? "text-blue-500" : "text-blue-600")} />
          <span className="font-display font-black text-xl tracking-tight uppercase">Connectrix</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchLeaderboard}
            className={cn("p-2 rounded-lg transition-colors", isDarkMode ? "hover:bg-white/5" : "hover:bg-slate-100")}
          >
            <Trophy className="w-5 h-5 opacity-60" />
          </button>
          <button 
            onClick={() => setView("settings")}
            className={cn("p-2 rounded-lg transition-colors", isDarkMode ? "hover:bg-white/5" : "hover:bg-slate-100")}
          >
            <SettingsIcon className="w-5 h-5 opacity-60" />
          </button>
        </div>
      </nav>

      <main className="min-h-screen pt-24 pb-16 flex flex-col items-center justify-center px-4 w-full max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {view === "landing" && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="text-center space-y-10 max-w-2xl"
            >
              <div className="space-y-4">
                <h1 className="text-6xl md:text-8xl font-display font-black tracking-tight leading-none uppercase">
                  Align.<br />
                  Connect.<br />
                  <span className="text-blue-500">Win.</span>
                </h1>
                <p className="text-base md:text-lg font-medium text-slate-500 max-w-sm mx-auto">
                  A modern strategy classic. Play against the computer or challenge a friend in real-time.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => { setGameMode("pvp"); setView("setup"); }}
                  className={cn("premium-button px-10 shadow-lg", isDarkMode ? "bg-white text-charcoal-bg" : "bg-black text-white")}
                >
                  <Users className="w-4 h-4" />
                  Invite a Friend/Join
                </button>
                <button 
                  onClick={() => { setGameMode("solo"); setView("setup"); }}
                  className={cn("premium-button border", isDarkMode ? "border-white/10 hover:bg-white/5 shadow-xl" : "border-slate-200 hover:bg-slate-50 shadow-sm")}
                >
                  <Play className="w-4 h-4" />
                  Play Solo
                </button>
              </div>
            </motion.div>
          )}

          {view === "setup" && (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn("w-full max-w-md premium-card p-8 md:p-10 space-y-8", cardClass)}
            >
              <div className="space-y-2 text-center">
                <h2 className="text-2xl font-display font-black uppercase tracking-tight">Setup Game</h2>
                <p className="text-sm font-medium text-slate-500">Customize your player profile.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nickname</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={cn("premium-input pl-12 h-14", inputClass)}
                      placeholder="e.g. StratMaster"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Token Color</label>
                  <div className="flex justify-between gap-2 overflow-x-auto pb-2">
                    {ACCENT_COLORS.map(color => (
                        <button 
                          key={color.hex}
                          onClick={() => setSelectedColor(color.hex)}
                          className={cn(
                            "w-10 h-10 rounded-full border-2 transition-all duration-300 shrink-0",
                            selectedColor === color.hex ? "scale-110 border-white ring-2 ring-blue-500/50" : "border-transparent opacity-60 hover:opacity-100"
                          )}
                          style={{ backgroundColor: color.hex }}
                        />
                    ))}
                  </div>
                </div>

                {gameMode === "pvp" && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Social Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                        onClick={() => setRoomAction("create")}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all font-bold text-sm",
                          roomAction === "create" ? "border-blue-500 bg-blue-500/10 text-blue-500" : (isDarkMode ? "border-transparent bg-white/5 text-slate-500" : "border-transparent bg-slate-100 text-slate-500")
                        )}
                       >
                         Host Match
                       </button>
                       <button 
                        onClick={() => setRoomAction("join")}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all font-bold text-sm",
                          roomAction === "join" ? "border-blue-500 bg-blue-500/10 text-blue-500" : (isDarkMode ? "border-transparent bg-white/5 text-slate-500" : "border-transparent bg-slate-100 text-slate-500")
                        )}
                       >
                         Join Code
                       </button>
                    </div>
                  </div>
                )}

                {gameMode === "pvp" && roomAction === "join" && (
                   <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Room Code</label>
                    <input 
                      type="text" 
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      className={cn("premium-input text-center text-2xl font-black tracking-[0.2em] h-14", inputClass)}
                      placeholder="ABCD"
                      maxLength={4}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 pt-2">
                <button 
                  onClick={gameMode === "solo" ? handleJoin : (roomAction === "create" ? handleCreate : handleJoin)}
                  disabled={!username || (gameMode === "pvp" && (!roomAction || (roomAction === "join" && !roomCode)))}
                  className={cn(
                    "premium-button w-full h-14 !rounded-2xl shadow-xl shadow-blue-500/10",
                    isDarkMode ? "bg-blue-600 text-white" : "bg-blue-600 text-white"
                  )}
                >
                  {gameMode === "solo" ? "Start Game" : "Connect Now"}
                </button>
                <button onClick={handleExit} className="text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-400">
                  Back to Menu
                </button>
              </div>
            </motion.div>
          )}

          {view === "room" && (
            <motion.div key="room" className="text-center space-y-12 w-full max-w-xl">
              <div className="space-y-6">
                <div className={cn("premium-card inline-block p-10 border-dashed relative", cardClass)}>
                  <h1 className="text-8xl font-display font-black text-blue-500">{roomCode}</h1>
                  <button 
                    onClick={copyToClipboard}
                    className="absolute -right-4 -top-4 w-12 h-12 rounded-xl bg-white text-charcoal-bg shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {hasCopied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-bold uppercase tracking-tight">Syncing connection...</h2>
                  <p className="text-slate-500">Share the access code with your opponent.</p>
                </div>
              </div>

              <div className="flex flex-col gap-8">
                <div className="flex justify-center gap-10">
                  {gameState?.players.map((p) => {
                    const isMe = p.id === socket.id;
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-4">
                          <div className="relative group">
                            <div className="w-20 h-20 rounded-2xl shadow-xl flex items-center justify-center p-1 transition-transform group-hover:scale-105" style={{ backgroundColor: p.color }}>
                              <div className="w-full h-full rounded-xl border border-white/20 shadow-inner" />
                            </div>
                            {isMe && <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-lg ring-2 ring-white">YOU</div>}
                          </div>
                          <span className="font-display font-bold text-sm uppercase text-slate-400 tracking-wider truncate w-24">{p.name}</span>
                      </div>
                    );
                  })}
                  {gameState?.players.length === 1 && (
                    <div className="flex flex-col items-center gap-4 opacity-30 animate-pulse">
                        <div className={cn("w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center", isDarkMode ? "border-white/20" : "border-slate-300")}>
                          <Users className="w-8 h-8" />
                        </div>
                        <span className="font-display font-bold text-sm uppercase tracking-wider italic">Awaiting...</span>
                    </div>
                  )}
                </div>

                {/* Live Color Picker in Room */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Customize Your Color</p>
                  <div className="flex justify-center gap-3">
                    {ACCENT_COLORS.map((color) => {
                      const isTaken = takenColor === color.hex;
                      const isSelected = gameState?.players.find(p => p.id === socket.id)?.color === color.hex;
                      
                      return (
                        <button
                          key={color.hex}
                          onClick={() => !isTaken && handleUpdateColor(color.hex)}
                          disabled={isTaken}
                          className={cn(
                            "w-10 h-10 rounded-xl transition-all relative overflow-hidden",
                            isSelected ? "ring-2 ring-blue-500 ring-offset-4 ring-offset-charcoal-bg scale-110" : "hover:scale-105 active:scale-95",
                            isTaken ? "opacity-20 cursor-not-allowed grayscale" : "opacity-100"
                          )}
                          style={{ backgroundColor: color.hex }}
                        >
                          {isSelected && <Check className="w-4 h-4 text-white mx-auto" />}
                          {isTaken && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="w-4 h-0.5 bg-white rotate-45" /><div className="w-4 h-0.5 bg-white -rotate-45" /></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {gameState?.players.length === 2 && gameState.status === 'waiting' && socket.id === gameState.players[0].id && (
                  <div className="animate-in fade-in zoom-in duration-500">
                    <button 
                      onClick={() => socket.emit("start-game", roomCode)}
                      className="premium-button px-12 py-5 shadow-2xl mx-auto bg-blue-600 text-white"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Start Game
                    </button>
                  </div>
                )}
              </div>

              <button onClick={handleExit} className="text-xs font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2 mx-auto hover:grayscale-0 transition-all opacity-70 hover:opacity-100">
                <LogOut className="w-4 h-4" /> Cancel Session
              </button>
            </motion.div>
          )}

          {view === "game" && gameState && (
            <motion.div 
              key="game" 
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full flex flex-col md:flex-row items-center md:items-start justify-center gap-6 md:gap-8 lg:gap-12 w-full"
            >
              {/* Mobile Players Header */}
              <div className="w-full flex md:hidden justify-between items-center gap-3 px-2 order-1 max-w-md mx-auto">
                 {[0, 1].map((playerIndex) => {
                    const player = gameState.players[playerIndex];
                    if (!player) {
                      return (
                         <div key={playerIndex} className="flex flex-col gap-1 flex-1 p-3 rounded-2xl border border-transparent bg-white/5 opacity-50 grayscale">
                            <span className="font-display font-bold text-sm truncate">Waiting...</span>
                         </div>
                      );
                    }
                    return (
                       <div key={playerIndex} className={cn("flex flex-col gap-1.5 flex-1 p-3 rounded-2xl transition-all border", gameState.currentTurn === playerIndex ? (isDarkMode ? "bg-white/10 border-blue-500/30 ring-1 ring-blue-500/20 shadow-lg scale-105" : "bg-white border-blue-200 ring-2 ring-blue-500/5 shadow-md scale-105") : "opacity-50 border-transparent grayscale")}>
                          <div className="flex items-center justify-between gap-2">
                             <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-4 h-4 shrink-0 rounded-full shadow-inner" style={{ backgroundColor: player.color }} />
                                <span className="font-display font-bold text-sm tracking-tight truncate">{player.name}</span>
                             </div>
                             <span className={cn("text-[10px] font-black", timeLeft < 10 ? "text-rose-500" : (isDarkMode ? "text-slate-400" : "text-slate-500"), gameState.currentTurn !== playerIndex && "opacity-40")}>{timeLeft}s</span>
                          </div>
                          <div className={cn("w-full h-1 bg-slate-500/10 rounded-full overflow-hidden transition-opacity", gameState.currentTurn !== playerIndex && "opacity-40")}>
                             <motion.div 
                               initial={{ width: "100%" }} 
                               animate={{ width: `${(timeLeft / gameState.turnDuration) * 100}%` }} 
                               className={cn("h-full", timeLeft < 10 ? "bg-rose-500" : (isDarkMode ? "bg-blue-400" : "bg-blue-600"))} 
                             />
                          </div>
                       </div>
                    );
                 })}
              </div>

              {/* Player 1 - Desktop Only */}
              <div className="hidden md:flex flex-col items-center gap-6 w-40 lg:w-48 order-1 sticky top-24">
                 <div 
                    className={cn(
                      "p-4 md:p-6 rounded-3xl md:rounded-[2.5rem] flex flex-row md:flex-col items-center gap-4 transition-all border w-full text-center relative max-w-xs md:max-w-none",
                      gameState.currentTurn === 0 
                        ? (isDarkMode ? "bg-white/5 border-blue-500/30 ring-1 ring-blue-500/20 shadow-2xl scale-100 md:scale-105" : "bg-white border-blue-200 ring-2 ring-blue-500/5 shadow-lg scale-100 md:scale-105")
                        : "opacity-40 md:opacity-30 border-transparent md:grayscale"
                    )}
                  >
                     <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 flex items-center justify-center p-1 rounded-2xl shadow-xl" style={{ backgroundColor: gameState.players[0].color }}>
                        <div className="w-full h-full rounded-xl border border-white/20 shadow-inner" />
                     </div>
                     <div className="flex flex-col items-start md:items-center flex-1 min-w-0">
                       <span className="font-display font-black text-base md:text-lg uppercase tracking-tight truncate w-full text-left md:text-center">{gameState.players[0].name}</span>
                       <div className="w-full">
                         <div className={cn("w-full space-y-1 md:space-y-2 mt-1 md:mt-2 transition-opacity", gameState.currentTurn !== 0 && "opacity-40")}>
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest opacity-80 md:opacity-60">
                               <span className="hidden md:inline">Time</span>
                               <span className={cn(timeLeft < 10 ? "text-rose-500" : (isDarkMode ? "text-slate-400" : "text-slate-500"))}>{timeLeft}s</span>
                            </div>
                            <div className="hidden md:block h-1.5 w-full bg-slate-500/10 rounded-full overflow-hidden">
                               <motion.div 
                                  initial={{ width: "100%" }}
                                  animate={{ width: `${(timeLeft / gameState.turnDuration) * 100}%` }}
                                  className={cn("h-full transition-colors", timeLeft < 10 ? "bg-rose-500" : (isDarkMode ? "bg-blue-400" : "bg-blue-600"))}
                               />
                            </div>
                         </div>
                       </div>
                     </div>
                  </div>
                  <div className="hidden md:block text-[10px] font-black uppercase tracking-[0.4em] opacity-30">Player 01</div>
              </div>

              {/* Game Board (Center) */}
              <div className="flex flex-col items-center gap-6 order-2 shrink-0 max-w-[100vw] overflow-x-auto px-2">
                <div className={cn("premium-card p-2 sm:p-3 md:p-5 mt-4 sm:mt-6 md:mt-8 shadow-2xl relative", cardClass)}>
                  <div className="relative">
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-3">
                    {gameState.board[0].map((_, colIndex) => {
                      const isClickable = gameState.status === "playing" && !gameState.board[0][colIndex] && gameState.players[gameState.currentTurn]?.id === socket.id;
                      
                      return (
                        <div 
                          key={colIndex} 
                          className="flex flex-col gap-1 sm:gap-1.5 md:gap-3 group relative rounded-xl transition-all"
                        >
                          {/* Top Indicator / Move Drop Button */}
                          <div className={cn(
                            "absolute -top-12 sm:-top-14 md:-top-[72px] left-0 w-full flex justify-center pb-2 transition-all duration-300 z-50",
                            isClickable ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
                          )}>
                             <button 
                                type="button"
                                disabled={!isClickable}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isClickable) {
                                    socket.emit("make-move", { roomCode: gameState.roomCode, colIndex });
                                  }
                                }}
                                className={cn(
                                  "w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 group/btn border-3 md:border-4",
                                  isDarkMode 
                                    ? "bg-slate-800 border-blue-500 text-blue-400 shadow-blue-500/20" 
                                    : "bg-white border-blue-600 text-blue-600 shadow-blue-600/20"
                                )}
                                title="Drop piece here"
                             >
                               <ChevronDown className="w-6 h-6 sm:w-7 sm:h-7 group-hover/btn:translate-y-0.5 transition-transform" strokeWidth={4} />
                             </button>
                          </div>

                          {isClickable && (
                            <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 md:group-hover:opacity-100 transition-opacity rounded-xl -m-1 pointer-events-none" />
                          )}

                          {[...Array(6)].map((_, rowIndex) => {
                            const cell = gameState.board[rowIndex][colIndex];
                            const player = cell ? gameState.players.find(p => p.symbol === cell) : null;
                            const isWinningPiece = gameState.winningLine?.some(([r, c]) => r === rowIndex && c === colIndex);
                            return (
                              <div key={rowIndex} className={cn("slot-wrapper w-8 sm:w-10 md:w-12 lg:w-14 xl:w-16 h-8 sm:h-10 md:h-12 lg:h-14 xl:h-16 shrink-0", slotInnerClass)}>
                                 <AnimatePresence>
                                   {cell && (
                                     <motion.div 
                                       initial={{ y: -450 }}
                                       animate={{ y: 0 }}
                                       transition={{ type: "spring", damping: 14, stiffness: 200 }}
                                       className={cn("piece-drop z-10 w-full h-full rounded-full shadow-inner border-[4px] md:border-[6px] lg:border-[8px] border-black/10", isWinningPiece && "winning-glow")}
                                       style={{ backgroundColor: player?.color }}
                                     />
                                   )}
                                 </AnimatePresence>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>

                  {/* Winning Line Overlay */}
                  <AnimatePresence>
                    {gameState.status === "finished" && gameState.winningLine && (
                      <motion.svg
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 pointer-events-none z-30 overflow-visible"
                        style={{ width: '100%', height: '100%' }}
                      >
                        {(() => {
                          const line = gameState.winningLine;
                          if (!line || line.length < 2) return null;
                          
                          // Sort to ensure we draw from one end to the other
                          const sorted = [...line].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                          const start = sorted[0];
                          const end = sorted[sorted.length - 1];

                          // Calculate center percentages
                          const getX = (col: number) => `${(col + 0.5) * (100 / 7)}%`;
                          const getY = (row: number) => `${(row + 0.5) * (100 / 6)}%`;

                          const color = gameState.players.find(p => p.symbol === gameState.board[start[0]][start[1]])?.color || "#fff";

                          return (
                            <g className="drop-shadow-[0_0_10px_rgba(0,0,0,0.3)]">
                              {/* outer glow/shadow line */}
                              <motion.line
                                x1={getX(start[1])}
                                y1={getY(start[0])}
                                x2={getX(end[1])}
                                y2={getY(end[0])}
                                stroke={color}
                                strokeWidth="20"
                                strokeLinecap="round"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 0.6 }}
                                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                                className="blur-md"
                              />
                              {/* main core line */}
                              <motion.line
                                x1={getX(start[1])}
                                y1={getY(start[0])}
                                x2={getX(end[1])}
                                y2={getY(end[0])}
                                stroke={color}
                                strokeWidth="10"
                                strokeLinecap="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                              />
                              {/* inner highlight line */}
                              <motion.line
                                x1={getX(start[1])}
                                y1={getY(start[0])}
                                x2={getX(end[1])}
                                y2={getY(end[0])}
                                stroke="white"
                                strokeWidth="4"
                                strokeLinecap="round"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 0.7 }}
                                transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                              />
                            </g>
                          );
                        })()}
                      </motion.svg>
                    )}
                  </AnimatePresence>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center items-center gap-4 mt-2">
                  <button 
                    onClick={() => socket.emit("restart-game", roomCode)}
                    className={cn("p-3 md:p-4 rounded-2xl transition-all hover:scale-105 active:scale-95", isDarkMode ? "bg-white/5 hover:bg-white/10" : "bg-slate-100 hover:bg-slate-200")}
                  >
                    <RefreshCw className="w-5 h-5 opacity-60" />
                  </button>
                  <button 
                    onClick={handleExit}
                    className={cn("px-6 md:px-8 py-3 md:py-4 rounded-2xl font-bold uppercase tracking-widest text-[10px] md:text-xs transition-all hover:scale-105 active:scale-95", isDarkMode ? "bg-rose-500/10 text-rose-500" : "bg-rose-50")}
                  >
                    Resign Match
                  </button>
                </div>
              </div>

              {/* Player 2 - Desktop Only */}
              <div className="hidden md:flex flex-col items-center gap-6 w-40 lg:w-48 order-3 sticky top-24">
                 <div 
                    className={cn(
                      "p-4 md:p-6 rounded-3xl md:rounded-[2.5rem] flex flex-row md:flex-col items-center gap-4 transition-all border w-full text-center relative max-w-xs md:max-w-none",
                      gameState.currentTurn === 1 
                        ? (isDarkMode ? "bg-white/5 border-blue-500/30 ring-1 ring-blue-500/20 shadow-2xl scale-100 md:scale-105" : "bg-white border-blue-200 ring-2 ring-blue-500/5 shadow-lg scale-100 md:scale-105")
                        : "opacity-40 md:opacity-30 border-transparent md:grayscale"
                    )}
                  >
                     <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 flex items-center justify-center p-1 rounded-2xl shadow-xl" style={{ backgroundColor: gameState.players[1]?.color || "#334155" }}>
                        <div className="w-full h-full rounded-xl border border-white/20 shadow-inner" />
                     </div>
                     <div className="flex flex-col items-start md:items-center flex-1 min-w-0">
                       <span className="font-display font-black text-base md:text-lg uppercase tracking-tight truncate w-full text-left md:text-center">{gameState.players[1]?.name || "Waiting..."}</span>
                       <div className="w-full">
                         <div className={cn("w-full space-y-1 md:space-y-2 mt-1 md:mt-2 transition-opacity", gameState.currentTurn !== 1 && "opacity-40")}>
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest opacity-80 md:opacity-60">
                               <span className="hidden md:inline">Time</span>
                               <span className={cn(timeLeft < 10 ? "text-rose-500" : (isDarkMode ? "text-slate-400" : "text-slate-500"))}>{timeLeft}s</span>
                            </div>
                            <div className="hidden md:block h-1.5 w-full bg-slate-500/10 rounded-full overflow-hidden">
                               <motion.div 
                                  initial={{ width: "100%" }}
                                  animate={{ width: `${(timeLeft / gameState.turnDuration) * 100}%` }}
                                  className={cn("h-full transition-colors", timeLeft < 10 ? "bg-rose-500" : (isDarkMode ? "bg-blue-400" : "bg-blue-600"))}
                               />
                            </div>
                         </div>
                       </div>
                     </div>
                  </div>
                  <div className="hidden md:block text-[10px] font-black uppercase tracking-[0.4em] opacity-30">Player 02</div>
              </div>

              {/* Game Winner Modal - Integrated into game view */}
              <AnimatePresence mode="wait">
                {gameState.status === 'finished' && (
                  <motion.div 
                    key={`winner-modal-${gameState.winner}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 1.5 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
                  >
                    <motion.div 
                      key="winner-content"
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 20 }}
                      className={cn("max-w-md w-full p-10 md:p-14 rounded-3xl text-center space-y-8 shadow-2xl", cardClass)}
                    >
                       <div className="space-y-4">
                          <div className={cn("w-20 h-20 mx-auto rounded-3xl flex items-center justify-center bg-blue-500/10 text-blue-500 shadow-inner")}>
                            <Medal className="w-10 h-10" />
                          </div>
                          <div className="space-y-1">
                            <h2 className="text-4xl font-display font-black tracking-tight uppercase">
                              {gameState.winner === "Draw" ? "Equal Minds" : "Victory"}
                            </h2>
                            <p className="text-lg font-bold text-slate-500 uppercase tracking-widest">
                              {gameState.winner === "Draw" ? "Stalemate" : `${gameState.winner} won`}
                            </p>
                          </div>
                       </div>

                       <div className="flex flex-col gap-3 w-full">
                         <button 
                          onClick={() => socket.emit("restart-game", roomCode)}
                          className={cn(
                            "w-full py-4 px-8 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg",
                            isDarkMode 
                              ? "bg-white text-slate-900 hover:bg-slate-100 shadow-white/5" 
                              : "bg-slate-900 text-white hover:bg-slate-800 shadow-black/10"
                          )}
                         >
                           <RefreshCw className="w-5 h-5" />
                           Play Again
                         </button>
                         <button 
                          onClick={handleExit} 
                          className={cn(
                            "w-full py-4 px-8 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 border-2",
                            isDarkMode
                              ? "border-slate-700 text-slate-400 hover:bg-white/5 hover:text-white"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          )}
                         >
                           Exit to Menu
                         </button>
                       </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {view === "leaderboard" && (
            <motion.div 
              key="leaderboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full max-w-4xl space-y-12"
            >
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <h1 className="text-6xl font-display font-black tracking-tight uppercase">Hall of Fame</h1>
                  <p className="text-slate-500 font-medium">Top performing strategists.</p>
                </div>
                <button onClick={handleExit} className={cn("p-4 rounded-2xl transition-colors shrink-0", cardClass)}>
                  <ArrowLeft className="w-6 h-6" />
                </button>
              </div>

              <div className={cn("premium-card overflow-hidden shadow-2xl ", cardClass)}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className={isDarkMode ? "bg-white/5" : "bg-slate-50"}>
                      <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <th className="px-8 py-6">Rank</th>
                        <th className="px-8 py-6">Username</th>
                        <th className="px-8 py-6">Wins</th>
                        <th className="px-8 py-6">Losses</th>
                        <th className="px-8 py-6">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {leaderboard.length === 0 ? (
                        <tr><td colSpan={5} className="p-20 text-center opacity-30 text-sm font-bold uppercase tracking-widest">No data available</td></tr>
                      ) : (
                        leaderboard.map((stat, i) => {
                          const total = stat.wins + stat.losses;
                          const rate = total > 0 ? Math.round((stat.wins / total) * 100) : 0;
                          return (
                            <tr key={stat.name} className="hover:bg-white/5 transition-colors">
                              <td className="px-8 py-8 font-display font-black text-xl text-slate-500">{(i+1).toString().padStart(2, '0')}</td>
                              <td className="px-8 py-8">
                                <span className="font-display font-bold text-lg tracking-tight uppercase truncate max-w-[150px] inline-block">{stat.name}</span>
                              </td>
                              <td className="px-8 py-8">
                                <span className="font-black text-emerald-500 text-xl">{stat.wins}</span>
                              </td>
                              <td className="px-8 py-8 text-slate-500 font-medium">{stat.losses}</td>
                              <td className="px-8 py-8">
                                <div className="flex items-center gap-3">
                                   <div className="w-16 h-1.5 bg-slate-500/20 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500" style={{ width: `${rate}%` }} />
                                   </div>
                                   <span className="text-xs font-black opacity-60">{rate}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {view === "settings" && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn("w-full max-w-md premium-card p-10 md:p-12 space-y-10", cardClass)}
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h2 className="text-2xl font-display font-black uppercase tracking-tight">Settings</h2>
                  <p className="text-sm font-medium text-slate-500">Personalize your environment.</p>
                </div>
                <button onClick={handleExit} className="p-2 opacity-60 hover:opacity-100">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3">
                       <Timer className="w-5 h-5 text-blue-400" />
                       <span className="font-bold text-sm uppercase tracking-wide">Turn Limit</span>
                    </div>
                    <select 
                      value={preferredTurnDuration}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setPreferredTurnDuration(val);
                        if (gameState && gameState.status === "waiting") {
                          socket.emit("update-settings", { roomCode, turnDuration: val });
                        }
                      }}
                      className={cn("bg-transparent font-bold text-sm outline-none cursor-pointer", isDarkMode ? "text-white" : "text-slate-900")}
                    >
                      <option value="15" className="bg-charcoal-bg">15s</option>
                      <option value="30" className="bg-charcoal-bg">30s</option>
                      <option value="45" className="bg-charcoal-bg">45s</option>
                      <option value="60" className="bg-charcoal-bg">60s</option>
                    </select>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                   <div className="flex items-center gap-3">
                      {isDarkMode ? <Moon className="w-5 h-5 text-blue-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                      <span className="font-bold text-sm uppercase tracking-wide">Dark Mode</span>
                   </div>
                   <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={cn(
                      "w-12 h-6 rounded-full relative transition-colors duration-300",
                      isDarkMode ? "bg-blue-600" : "bg-slate-300"
                    )}
                   >
                     <div className={cn(
                       "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                       isDarkMode ? "left-7" : "left-1"
                     )} />
                   </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                   <div className="flex items-center gap-3">
                      {isSoundEnabled ? <Volume2 className="w-5 h-5 text-blue-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
                      <span className="font-bold text-sm uppercase tracking-wide">Sound Effects</span>
                   </div>
                   <button 
                    onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                    className={cn(
                      "w-12 h-6 rounded-full relative transition-colors duration-300",
                      isSoundEnabled ? "bg-blue-600" : "bg-slate-300"
                    )}
                   >
                     <div className={cn(
                       "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                       isSoundEnabled ? "left-7" : "left-1"
                     )} />
                   </button>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <button 
                    onClick={handleResetStats}
                    className="w-full p-4 rounded-2xl bg-rose-500/10 text-rose-500 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-500/20 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Reset Data
                  </button>
                </div>
              </div>

              <div className="text-center pt-4">
                 <button onClick={handleExit} className="text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-400">
                   Back to Dashboard
                 </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 hidden md:block opacity-20 transition-opacity hover:opacity-100">
        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em]">
           <span>Connectrix Engine v1.0</span>
        </div>
      </footer>
    </div>
  );
}
