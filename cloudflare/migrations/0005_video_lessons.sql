CREATE TABLE IF NOT EXISTS video_lessons (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('YouTube', 'Rutube')),
  source_url TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS video_lessons_owner_idx ON video_lessons(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS video_lesson_assignments (
  video_id TEXT NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, student_id)
);

CREATE INDEX IF NOT EXISTS video_lesson_assignments_student_idx ON video_lesson_assignments(student_id, created_at DESC);
