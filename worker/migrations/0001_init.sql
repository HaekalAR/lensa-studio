CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_active
  ON sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sessions_started
  ON sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  original_key TEXT NOT NULL,
  preview_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  sha256 TEXT NOT NULL,
  captured_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_photos_session_captured
  ON photos(session_id, captured_at, created_at);

CREATE TABLE IF NOT EXISTS pending_uploads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  captured_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_created
  ON pending_uploads(created_at);

CREATE TABLE IF NOT EXISTS watcher_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_seen_at TEXT,
  agent_name TEXT,
  last_upload_at TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON login_attempts(ip, attempted_at);
