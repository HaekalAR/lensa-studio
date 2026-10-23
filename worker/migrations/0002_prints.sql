CREATE TABLE IF NOT EXISTS prints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  photo_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prints_session_created
  ON prints(session_id, created_at DESC);
