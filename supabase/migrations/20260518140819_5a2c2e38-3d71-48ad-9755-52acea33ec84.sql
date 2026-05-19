
CREATE TABLE public.chess_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn TEXT NOT NULL DEFAULT '',
  white_player TEXT,
  black_player TEXT,
  turn TEXT NOT NULL DEFAULT 'w',
  status TEXT NOT NULL DEFAULT 'waiting',
  winner TEXT,
  end_reason TEXT,
  time_control JSONB NOT NULL DEFAULT '{"initial": 0, "increment": 0}'::jsonb,
  white_time_ms INTEGER NOT NULL DEFAULT 0,
  black_time_ms INTEGER NOT NULL DEFAULT 0,
  last_move_at TIMESTAMPTZ,
  draw_offered_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chess_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chess_rooms(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_color TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chess_messages_room_id_idx ON public.chess_messages(room_id, created_at);

ALTER TABLE public.chess_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_messages ENABLE ROW LEVEL SECURITY;

-- Public access: anyone who knows the room id can read/write (couple sharing link).
CREATE POLICY "anyone can read rooms" ON public.chess_rooms FOR SELECT USING (true);
CREATE POLICY "anyone can insert rooms" ON public.chess_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can update rooms" ON public.chess_rooms FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "anyone can read messages" ON public.chess_messages FOR SELECT USING (true);
CREATE POLICY "anyone can insert messages" ON public.chess_messages FOR INSERT WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_messages;
ALTER TABLE public.chess_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.chess_messages REPLICA IDENTITY FULL;
