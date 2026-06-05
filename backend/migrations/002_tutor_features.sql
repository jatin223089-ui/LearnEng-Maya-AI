-- Tutor features: vocab spotlight, spaced review, session fluency stats, daily mission
ALTER TABLE messages ADD COLUMN IF NOT EXISTS vocab JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_mission_date TEXT;

CREATE TABLE IF NOT EXISTS session_stats (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    words_spoken INTEGER NOT NULL DEFAULT 0,
    avg_utterance_words REAL NOT NULL DEFAULT 0,
    avg_pronunciation_score REAL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_review ON messages (next_review_at)
    WHERE correction IS NOT NULL;
