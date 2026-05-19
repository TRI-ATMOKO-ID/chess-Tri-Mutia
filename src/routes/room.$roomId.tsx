import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { supabase } from "@/integrations/supabase/client";
import { formatTime, gameResultText, TimeControl } from "@/lib/chess-utils";

export const Route = createFileRoute("/room/$roomId")({
  head: () => ({
    meta: [
      { title: "Room Catur — Tri & Mutia" },
      { name: "description", content: "Room catur online realtime." },
    ],
  }),
  component: RoomPage,
});

type Room = {
  id: string;
  fen: string;
  pgn: string;
  white_player: string | null;
  black_player: string | null;
  turn: "w" | "b";
  status: "waiting" | "playing" | "finished";
  winner: string | null;
  end_reason: string | null;
  time_control: TimeControl;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: string | null;
  draw_offered_by: string | null;
};

type Message = {
  id: string;
  room_id: string;
  player_name: string;
  player_color: string;
  text: string;
  created_at: string;
};

const NAME_KEY = "catur-tm-name";

function RoomPage() {
  const { roomId } = Route.useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [name, setName] = useState<string>("");
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatOpenMobile, setChatOpenMobile] = useState<"chat" | "moves">("moves");
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const timeoutClaimedRef = useRef(false);

  // Load name from localStorage
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(NAME_KEY) : null;
    if (stored) setName(stored);
    else setNamePromptOpen(true);
  }, []);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: r, error: e1 } = await supabase.from("chess_rooms").select("*").eq("id", roomId).maybeSingle();
      if (cancelled) return;
      if (e1) { setError(e1.message); return; }
      if (!r) { setError("Room tidak ditemukan."); return; }
      setRoom(r as unknown as Room);
      const { data: msgs } = await supabase.from("chess_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true });
      if (!cancelled && msgs) setMessages(msgs as Message[]);
    })();
    return () => { cancelled = true; };
  }, [roomId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chess_rooms", filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new as unknown as Room);
        timeoutClaimedRef.current = false;
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chess_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  // Tick for live timer
  useEffect(() => {
    if (!room || room.status !== "playing" || room.time_control.initial === 0) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [room]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

  // Auto-join as white/black if seat free
  useEffect(() => {
    if (!room || !name) return;
    const isAlreadySeated = room.white_player === name || room.black_player === name;
    if (isAlreadySeated) return;
    (async () => {
      if (!room.white_player) {
        await supabase.from("chess_rooms").update({ white_player: name, updated_at: new Date().toISOString() }).eq("id", room.id).is("white_player", null);
      } else if (!room.black_player && room.white_player !== name) {
        const startPlaying = { black_player: name, status: "playing" as const, last_move_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        await supabase.from("chess_rooms").update(startPlaying).eq("id", room.id).is("black_player", null);
      }
    })();
  }, [room, name]);

  const chess = useMemo(() => {
    if (!room) return null;
    try { return new Chess(room.fen); } catch { return null; }
  }, [room?.fen]);

  const myColor: "w" | "b" | null = room && name
    ? room.white_player === name ? "w" : room.black_player === name ? "b" : null
    : null;
  const isSpectator = !!room && !!name && myColor === null && !!room.white_player && !!room.black_player && room.white_player !== name && room.black_player !== name;
  const isMyTurn = !!room && room.status === "playing" && myColor !== null && room.turn === myColor;

  // Live timer display
  const liveTimes = useMemo(() => {
    if (!room) return { w: 0, b: 0 };
    let w = room.white_time_ms;
    let b = room.black_time_ms;
    if (room.status === "playing" && room.time_control.initial > 0 && room.last_move_at) {
      const elapsed = now - new Date(room.last_move_at).getTime();
      if (room.turn === "w") w = Math.max(0, w - elapsed);
      else b = Math.max(0, b - elapsed);
    }
    return { w, b };
  }, [room, now]);

  // Timeout auto-claim
  useEffect(() => {
    if (!room || room.status !== "playing" || room.time_control.initial === 0 || timeoutClaimedRef.current) return;
    const t = room.turn === "w" ? liveTimes.w : liveTimes.b;
    if (t <= 0 && myColor) {
      timeoutClaimedRef.current = true;
      const winner = room.turn === "w" ? "b" : "w";
      supabase.from("chess_rooms").update({
        status: "finished",
        winner,
        end_reason: "timeout",
        white_time_ms: Math.max(0, liveTimes.w),
        black_time_ms: Math.max(0, liveTimes.b),
        updated_at: new Date().toISOString(),
      }).eq("id", room.id).eq("status", "playing");
    }
  }, [liveTimes, room, myColor]);

  const handleDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!room || !chess || !isMyTurn || !targetSquare) return false;
    const game = new Chess(room.fen);
    let move;
    try {
      move = game.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    } catch { return false; }
    if (!move) return false;

    // Compute timer
    const tc = room.time_control;
    let newWhite = room.white_time_ms;
    let newBlack = room.black_time_ms;
    if (tc.initial > 0 && room.last_move_at) {
      const elapsed = Date.now() - new Date(room.last_move_at).getTime();
      if (room.turn === "w") newWhite = Math.max(0, newWhite - elapsed) + tc.increment;
      else newBlack = Math.max(0, newBlack - elapsed) + tc.increment;
    }

    const finished = game.isGameOver();
    const winner = game.isCheckmate() ? room.turn : null;
    const end_reason = game.isCheckmate() ? "checkmate" : game.isDraw() ? "draw" : null;

    supabase.from("chess_rooms").update({
      fen: game.fen(),
      pgn: game.pgn(),
      turn: game.turn(),
      white_time_ms: newWhite,
      black_time_ms: newBlack,
      last_move_at: new Date().toISOString(),
      status: finished ? "finished" : "playing",
      winner,
      end_reason,
      draw_offered_by: null,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id).then(({ error }) => {
      if (error) setError(error.message);
    });
    return true;
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || !room || !myColor) return;
    const dt = Date.now() - lastSentRef.current;
    if (dt < 800) return;
    if (text.length > 280) return;
    lastSentRef.current = Date.now();
    setChatInput("");
    await supabase.from("chess_messages").insert({
      room_id: room.id,
      player_name: name,
      player_color: myColor,
      text,
    });
  };

  const resign = async () => {
    if (!room || !myColor || room.status !== "playing") return;
    if (!confirm("Yakin mau menyerah?")) return;
    await supabase.from("chess_rooms").update({
      status: "finished",
      winner: myColor === "w" ? "b" : "w",
      end_reason: "resign",
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
  };

  const offerDraw = async () => {
    if (!room || !myColor) return;
    await supabase.from("chess_rooms").update({
      draw_offered_by: myColor,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
  };

  const acceptDraw = async () => {
    if (!room) return;
    await supabase.from("chess_rooms").update({
      status: "finished",
      end_reason: "draw_agreed",
      draw_offered_by: null,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
  };

  const declineDraw = async () => {
    if (!room) return;
    await supabase.from("chess_rooms").update({
      draw_offered_by: null,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
  };

  const rematch = async () => {
    if (!room) return;
    const tc = room.time_control;
    const { data, error } = await supabase.from("chess_rooms").insert({
      time_control: tc,
      white_time_ms: tc.initial,
      black_time_ms: tc.initial,
      white_player: room.black_player, // swap
      black_player: room.white_player,
      status: room.black_player && room.white_player ? "playing" : "waiting",
      last_move_at: room.black_player && room.white_player ? new Date().toISOString() : null,
    }).select("id").single();
    if (error || !data) return;
    window.location.href = `/room/${data.id}`;
  };

  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => alert("Link disalin!"));
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Link to="/" className="text-primary underline">Kembali</Link>
        </div>
      </div>
    );
  }

  if (!room) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Memuat room...</div>;
  }

  const orientation: "white" | "black" = myColor === "b" ? "black" : "white";
  const resultText = chess && chess.isGameOver() ? gameResultText(chess) : null;
  const finalText = room.status === "finished"
    ? room.end_reason === "resign"
      ? `${room.winner === "w" ? "Putih" : "Hitam"} menang (lawan menyerah)`
      : room.end_reason === "timeout"
        ? `${room.winner === "w" ? "Putih" : "Hitam"} menang (waktu habis)`
        : room.end_reason === "draw_agreed"
          ? "Remis (disepakati)"
          : resultText ?? "Game selesai"
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent p-3 md:p-6">
      {/* Name prompt */}
      {namePromptOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold mb-3 text-foreground">Siapa nama kamu?</h2>
            <p className="text-sm text-muted-foreground mb-4">Buat dikenali pasanganmu di papan.</p>
            <div className="flex gap-2 mb-3">
              {["Tri", "Mutia"].map((n) => (
                <button key={n} onClick={() => setNameInput(n)} className="flex-1 rounded-xl border border-input py-2 text-sm hover:bg-accent">{n}</button>
              ))}
            </div>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Atau ketik nama..."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm mb-3"
              maxLength={32}
            />
            <button
              onClick={() => {
                const n = nameInput.trim();
                if (!n) return;
                localStorage.setItem(NAME_KEY, n);
                setName(n);
                setNamePromptOpen(false);
              }}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2 font-semibold hover:opacity-90"
            >
              Lanjut
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Beranda</Link>
          <div className="flex gap-2">
            <button onClick={copyLink} className="text-xs px-3 py-1.5 rounded-full bg-card border border-border hover:bg-accent">Salin Link</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          {/* Board side */}
          <div className="bg-card rounded-2xl p-4 shadow-sm border border-border">
            {/* Opponent (top) */}
            <PlayerStrip
              name={orientation === "white" ? room.black_player : room.white_player}
              color={orientation === "white" ? "b" : "w"}
              time={orientation === "white" ? liveTimes.b : liveTimes.w}
              isTurn={room.status === "playing" && room.turn === (orientation === "white" ? "b" : "w")}
              showTimer={room.time_control.initial > 0}
              isMe={false}
            />

            <div className="my-3">
              <Chessboard options={{
                position: room.fen,
                boardOrientation: orientation,
                allowDragging: isMyTurn,
                onPieceDrop: handleDrop,
                animationDurationInMs: 200,
                darkSquareStyle: { backgroundColor: "#c79885" },
                lightSquareStyle: { backgroundColor: "#f5e6d8" },
              }} />
            </div>

            {/* Me (bottom) */}
            <PlayerStrip
              name={orientation === "white" ? room.white_player : room.black_player}
              color={orientation === "white" ? "w" : "b"}
              time={orientation === "white" ? liveTimes.w : liveTimes.b}
              isTurn={room.status === "playing" && room.turn === (orientation === "white" ? "w" : "b")}
              showTimer={room.time_control.initial > 0}
              isMe={true}
            />

            {/* Status */}
            <div className="mt-4 text-center text-sm">
              {room.status === "waiting" && (
                <p className="text-muted-foreground">
                  Menunggu pemain kedua. Bagikan link ini ke pasanganmu.
                </p>
              )}
              {room.status === "playing" && chess?.inCheck() && (
                <p className="text-destructive font-semibold">Skak!</p>
              )}
              {room.status === "finished" && (
                <p className="font-semibold text-foreground">{finalText}</p>
              )}
              {isSpectator && (
                <p className="text-muted-foreground text-xs mt-1">Kamu menonton sebagai spectator.</p>
              )}
            </div>

            {/* Action buttons */}
            {myColor && room.status === "playing" && (
              <div className="mt-3 flex gap-2 justify-center flex-wrap">
                {room.draw_offered_by && room.draw_offered_by !== myColor ? (
                  <>
                    <span className="text-sm text-muted-foreground self-center">Lawan menawarkan remis:</span>
                    <button onClick={acceptDraw} className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground">Terima</button>
                    <button onClick={declineDraw} className="text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground">Tolak</button>
                  </>
                ) : (
                  <>
                    <button onClick={offerDraw} disabled={!!room.draw_offered_by} className="text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:opacity-80 disabled:opacity-50">
                      {room.draw_offered_by === myColor ? "Tawaran remis dikirim" : "Tawar Remis"}
                    </button>
                    <button onClick={resign} className="text-xs px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground hover:opacity-80">Menyerah</button>
                  </>
                )}
              </div>
            )}
            {room.status === "finished" && myColor && (
              <div className="mt-3 text-center">
                <button onClick={rematch} className="text-sm px-4 py-2 rounded-full bg-primary text-primary-foreground hover:opacity-90">Rematch</button>
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden h-[500px] lg:h-auto lg:min-h-[500px]">
            <div className="flex border-b border-border">
              <button
                onClick={() => setChatOpenMobile("moves")}
                className={`flex-1 py-2.5 text-sm font-medium ${chatOpenMobile === "moves" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}
              >Langkah</button>
              <button
                onClick={() => setChatOpenMobile("chat")}
                className={`flex-1 py-2.5 text-sm font-medium ${chatOpenMobile === "chat" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}
              >Chat</button>
            </div>

            {chatOpenMobile === "moves" ? (
              <div className="flex-1 overflow-y-auto p-3 text-sm font-mono whitespace-pre-wrap text-foreground">
                {room.pgn || <span className="text-muted-foreground font-sans">Belum ada langkah.</span>}
              </div>
            ) : (
              <>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                  {messages.length === 0 && <p className="text-xs text-muted-foreground text-center mt-4">Belum ada pesan.</p>}
                  {messages.map((m) => {
                    const mine = m.player_name === name;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                          {!mine && <div className="text-[10px] font-semibold opacity-80">{m.player_name}</div>}
                          {m.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-2 border-t border-border flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                    placeholder={myColor ? "Tulis pesan..." : "Hanya pemain bisa chat"}
                    disabled={!myColor}
                    maxLength={280}
                    className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                  />
                  <button onClick={sendChat} disabled={!myColor || !chatInput.trim()} className="px-3 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50">Kirim</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerStrip({ name, color, time, isTurn, showTimer, isMe }: {
  name: string | null; color: "w" | "b"; time: number; isTurn: boolean; showTimer: boolean; isMe: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${isTurn ? "bg-primary/10 ring-1 ring-primary/40" : "bg-muted"}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-4 h-4 rounded-full border ${color === "w" ? "bg-white border-gray-400" : "bg-gray-800 border-gray-600"}`} />
        <span className="font-medium text-foreground text-sm">
          {name ?? <span className="italic text-muted-foreground">Menunggu...</span>}
          {isMe && name && <span className="text-xs text-muted-foreground ml-1">(kamu)</span>}
        </span>
      </div>
      {showTimer && (
        <span className={`font-mono text-lg font-semibold ${time < 30_000 ? "text-destructive" : "text-foreground"}`}>
          {formatTime(time)}
        </span>
      )}
    </div>
  );
}