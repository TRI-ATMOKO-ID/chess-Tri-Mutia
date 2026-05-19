import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TIME_PRESETS } from "@/lib/chess-utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Catur Tri & Mutia" },
      { name: "description", content: "Game catur online realtime untuk Tri & Mutia." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [presetId, setPresetId] = useState("none");
  const [joinId, setJoinId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    setCreating(true);
    setError(null);
    const preset = TIME_PRESETS.find((p) => p.id === presetId)!;
    const { data, error } = await supabase
      .from("chess_rooms")
      .insert({
        time_control: preset.tc,
        white_time_ms: preset.tc.initial,
        black_time_ms: preset.tc.initial,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      setError(error?.message ?? "Gagal bikin room");
      return;
    }
    navigate({ to: "/room/$roomId", params: { roomId: data.id } });
  };

  const joinRoom = () => {
    const id = joinId.trim();
    if (!id) return;
    // accept full URL or id
    const m = id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const roomId = m ? m[1] : id;
    navigate({ to: "/room/$roomId", params: { roomId } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary to-accent">
      <div className="w-full max-w-md bg-card rounded-3xl shadow-xl p-8 border border-border">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">♚ ♛</div>
          <h1 className="text-2xl font-bold text-foreground">Catur Tri & Mutia</h1>
          <p className="text-sm text-muted-foreground mt-1">Main catur online berdua, realtime.</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Kontrol waktu</label>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {TIME_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={createRoom}
            disabled={creating}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {creating ? "Membuat..." : "Buat Room Baru"}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">atau</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Gabung Room</label>
            <div className="flex gap-2">
              <input
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Tempel link / room ID"
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={joinRoom}
                className="rounded-xl bg-secondary text-secondary-foreground px-4 font-medium hover:opacity-90 transition"
              >
                Masuk
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
