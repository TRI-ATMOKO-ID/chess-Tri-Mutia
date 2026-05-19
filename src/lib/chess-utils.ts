import { Chess } from "chess.js";

export type TimeControl = { initial: number; increment: number }; // initial in ms, increment in ms

export const TIME_PRESETS: { id: string; label: string; tc: TimeControl }[] = [
  { id: "none", label: "Tanpa Timer", tc: { initial: 0, increment: 0 } },
  { id: "blitz3", label: "Blitz 3+0", tc: { initial: 3 * 60_000, increment: 0 } },
  { id: "blitz5", label: "Blitz 5+0", tc: { initial: 5 * 60_000, increment: 0 } },
  { id: "blitz53", label: "Blitz 5+3", tc: { initial: 5 * 60_000, increment: 3_000 } },
  { id: "rapid10", label: "Rapid 10+0", tc: { initial: 10 * 60_000, increment: 0 } },
  { id: "rapid15", label: "Rapid 15+10", tc: { initial: 15 * 60_000, increment: 10_000 } },
];

export function formatTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 10) return `${m}:${String(s).padStart(2, "0")}`;
  // show tenths under 10 seconds
  if (m === 0 && s < 10) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function makeChess(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

export function gameResultText(c: Chess): string | null {
  if (c.isCheckmate()) return `Skakmat — ${c.turn() === "w" ? "Hitam" : "Putih"} menang`;
  if (c.isStalemate()) return "Remis (stalemate)";
  if (c.isThreefoldRepetition()) return "Remis (3x ulangan)";
  if (c.isInsufficientMaterial()) return "Remis (material tidak cukup)";
  if (c.isDraw()) return "Remis";
  return null;
}