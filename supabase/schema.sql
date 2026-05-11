-- Run this in your Supabase project's SQL editor (supabase.com → SQL Editor → New query)
-- If upgrading an existing database, also run the ALTER TABLE statements at the bottom.

-- Profiles (one per auth user)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'Trainer',
  avatar_url TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  elo INTEGER NOT NULL DEFAULT 1000,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  credits INTEGER NOT NULL DEFAULT 1000,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: run if profiles table already exists
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 1000;

-- Decks
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  card_ids TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Games
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES profiles(id),
  player2_id UUID REFERENCES profiles(id),
  player1_deck_id UUID NOT NULL REFERENCES decks(id),
  player2_deck_id UUID REFERENCES decks(id),
  state JSONB,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','in_progress','finished')),
  winner_id UUID REFERENCES profiles(id),
  seed BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lobby chat messages
CREATE TABLE lobby_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  display_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Matchmaking queue
CREATE TABLE matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','matched')),
  matched_game_id UUID REFERENCES games(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER decks_updated_at BEFORE UPDATE ON decks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER games_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, own row can update
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Decks: own decks only
CREATE POLICY "decks_select" ON decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "decks_insert" ON decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decks_update" ON decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "decks_delete" ON decks FOR DELETE USING (auth.uid() = user_id);

-- Games: players in the game can read/update; anyone can insert (to create)
CREATE POLICY "games_select" ON games FOR SELECT USING (auth.uid() = player1_id OR auth.uid() = player2_id OR status = 'waiting');
CREATE POLICY "games_insert" ON games FOR INSERT WITH CHECK (auth.uid() = player1_id);
CREATE POLICY "games_update" ON games FOR UPDATE USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Lobby messages: anyone authenticated can read/insert
CREATE POLICY "lobby_messages_select" ON lobby_messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lobby_messages_insert" ON lobby_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Matchmaking: own entries
CREATE POLICY "matchmaking_select" ON matchmaking_queue FOR SELECT USING (auth.uid() = user_id OR status = 'waiting');
CREATE POLICY "matchmaking_insert" ON matchmaking_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "matchmaking_update" ON matchmaking_queue FOR UPDATE USING (true);
CREATE POLICY "matchmaking_delete" ON matchmaking_queue FOR DELETE USING (auth.uid() = user_id);

-- Enable Realtime for lobby_messages, games, matchmaking_queue
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE matchmaking_queue;
