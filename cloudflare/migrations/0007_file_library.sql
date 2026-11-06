CREATE TABLE IF NOT EXISTS teaching_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  folder_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS teaching_files_owner_idx ON teaching_files(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS teaching_file_recipients (
  file_id TEXT NOT NULL REFERENCES teaching_files(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (file_id, student_id)
);

CREATE INDEX IF NOT EXISTS teaching_file_recipients_student_idx ON teaching_file_recipients(student_id, file_id);

ALTER TABLE messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS room_screen_shares (
  room_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
