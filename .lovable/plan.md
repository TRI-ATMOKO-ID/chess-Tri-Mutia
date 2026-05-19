# Game Catur Online — Tri & Mutia

## Konsep integrasi

URL `https://progres-mt-sweet.lovable.app/mabar/[room-id]` adalah halaman SPA, bukan JSON API. Jadi yang kita lakukan:

- Di web utama, halaman `/mabar/[id]` cukup nampilkan tombol "Main Catur" yang mengarah ke project baru ini dengan room ID yang sama, misal: `https://catur-tri-mutia.lovable.app/room/e312028f-baa6-406d-9063-3779b5e2f7b4`
- Project catur baca `room-id` dari URL → 2 pemain yang buka URL sama otomatis ketemu di papan yang sama secara realtime.
- Tidak perlu API call ke web utama. Room ID jadi "kunci" pairing.

Catatan: untuk menambahkan tombol/link di web utama, nanti Anda buka project `progres-mt-sweet` di Lovable dan minta tambah link. Saya tidak bisa edit project lain dari sini.

## Yang akan dibangun

### 1. Halaman & routing
- `/` — landing: tombol "Buat Room Baru" (generate UUID → redirect ke `/room/[id]`) + input "Gabung Room" (paste room ID). Pilihan kontrol waktu sebelum bikin room: Tanpa Timer, Blitz 5+0, Blitz 5+3, Rapid 10+0, Rapid 15+10, atau Custom.
- `/room/$roomId` — papan catur + panel kanan (timer kedua pemain, chat, riwayat langkah).

### 2. Engine catur
- `chess.js` untuk legal moves, check, checkmate, stalemate, draw, FEN/PGN.
- `react-chessboard` untuk UI papan (drag & drop, highlight legal moves, board auto-flip sesuai warna pemain).

### 3. Realtime multiplayer (Lovable Cloud)
Aktifkan Lovable Cloud. Tabel:
- `chess_rooms`: `id`, `fen`, `pgn`, `white_player`, `black_player`, `turn`, `status` (waiting/playing/finished), `winner`, `time_control` (jsonb: `{initial, increment}`), `white_time_ms`, `black_time_ms`, `last_move_at`, `created_at`, `updated_at`.
- `chess_messages`: `id`, `room_id`, `player_name`, `player_color`, `text`, `created_at` — untuk chat.
- (Opsional) `chess_moves` untuk riwayat detail per langkah.

Realtime subscription ke kedua tabel → kedua pemain instan lihat langkah, timer update, dan pesan chat.

### 4. Identitas pemain
Saat masuk room, prompt nama (default suggestion: "Tri" / "Mutia"). Disimpan di localStorage. Pemain pertama jadi Putih, kedua jadi Hitam. Pemain ke-3+ jadi spectator (read-only, tidak bisa chat agar simpel — bisa ditambah nanti).

### 5. Timer (Blitz/Rapid)
- Disepakati saat bikin room, tersimpan di `time_control` row.
- Logika otoritatif di server: setiap kali pemain melangkah, server hitung selisih `now() - last_move_at`, kurangi dari waktu pemain yang barusan jalan, tambah `increment`, simpan, lalu set `turn` ke lawan dan `last_move_at = now()`.
- Client tampilkan countdown real-time secara lokal (smooth tiap 100ms) berdasarkan snapshot dari server, di-resync setiap kali ada update realtime.
- Kalau waktu habis: client tampilkan klaim "Time out", panggil server function `claim_timeout` yang verifikasi ulang server-side (hitung `now() - last_move_at` vs sisa waktu) sebelum set status `finished` + `winner` = lawan. Mencegah cheat clock dari client.
- Tombol Pause TIDAK ada (timer chess standar tidak bisa di-pause). Tapi ada "Tawar Remis" + "Resign".

### 6. Chat in-game
- Panel chat di samping/bawah papan (responsive: di bawah pada layar HP).
- Input text + tombol kirim (atau Enter). Maks 280 char per pesan, throttle 1 pesan/detik per pemain.
- Pesan disimpan ke `chess_messages` via server function (validasi nama pemain cocok dengan room + rate limit), broadcast via realtime.
- Notifikasi badge "•" di tab/panel kalau ada pesan baru saat fokus di papan.
- Hanya 2 pemain yang bisa chat. Spectator read-only.

### 7. Fitur game lain
- Validasi semua langkah lewat chess.js di server (anti-cheat dasar).
- Indikator giliran, status check/checkmate/draw/timeout.
- Tombol "Resign" dan "Tawar Remis" (perlu konfirmasi lawan).
- Tombol "Rematch" setelah game selesai — bikin row baru dengan warna terbalik, redirect kedua pemain.
- Riwayat langkah notasi PGN di panel.

### 8. Desain
Tema lembut sesuai vibe web Tri & Mutia (pink/peach `#ff6b9d` dari meta theme-color), tipografi clean, mobile-first (papan + tab switch antara Chat & Moves di HP, side-by-side di desktop).

## Detail teknis

- **Stack**: TanStack Start + Lovable Cloud (Supabase) untuk DB + Realtime.
- **Packages baru**: `chess.js`, `react-chessboard`.
- **Server functions** (`createServerFn`, otoritatif):
  - `createRoom({ timeControl })`
  - `joinRoom({ roomId, playerName })`
  - `makeMove({ roomId, from, to, promotion })` — validasi giliran, legalitas, hitung timer.
  - `claimTimeout({ roomId })`
  - `offerDraw / acceptDraw / declineDraw / resign({ roomId })`
  - `sendChat({ roomId, text })` — rate-limited.
  - `rematch({ roomId })`
- **Realtime**: Supabase Realtime channel per `room_id` subscribe ke `chess_rooms` row + `chess_messages` insert.
- **RLS**: read room/messages bagi siapa saja yang tahu room ID (pola "tahu link = bisa nonton"). Semua write WAJIB lewat server function (RLS deny direct insert/update dari client).

## Yang perlu Anda lakukan setelah game jadi

1. Saya kasih URL game-nya, mis. `https://catur-tri-mutia.lovable.app/room/{id}`.
2. Buka project `progres-mt-sweet` di Lovable, minta: "tambahkan tombol 'Main Catur' di halaman `/mabar/[id]` yang membuka URL game catur dengan room ID yang sama di tab baru".
