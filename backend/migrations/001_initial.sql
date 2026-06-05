-- EngLearn.ai schema for Supabase / Postgres
-- Apply in Supabase SQL editor or: psql $DATABASE_URL -f migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'Beginner',
    preferred_level TEXT NOT NULL DEFAULT 'Auto',
    streak INTEGER NOT NULL DEFAULT 0,
    minutes_practiced INTEGER NOT NULL DEFAULT 0,
    words_learned INTEGER NOT NULL DEFAULT 0,
    last_active_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL DEFAULT 'free-talk',
    title TEXT NOT NULL,
    opener_seeded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    correction JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at ASC);
