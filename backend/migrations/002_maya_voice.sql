-- Add Maya voice preference per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS maya_voice TEXT NOT NULL DEFAULT 'Kore';
