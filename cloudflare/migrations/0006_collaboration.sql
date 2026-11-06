CREATE TABLE IF NOT EXISTS student_groups (
  id TEXT PRIMARY KEY,
  tutor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS student_groups_tutor_idx ON student_groups(tutor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS student_group_members (
  group_id TEXT NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, student_id)
);

CREATE INDEX IF NOT EXISTS student_group_members_student_idx ON student_group_members(student_id, group_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipient_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES student_groups(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK ((recipient_id IS NOT NULL AND group_id IS NULL) OR (recipient_id IS NULL AND group_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS messages_direct_idx ON messages(recipient_id, sender_id, created_at);
CREATE INDEX IF NOT EXISTS messages_group_idx ON messages(group_id, created_at);

CREATE TABLE IF NOT EXISTS homework_attachments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS homework_attachments_task_idx ON homework_attachments(owner_id, task_id, created_at);

CREATE TABLE IF NOT EXISTS homework_attachment_recipients (
  attachment_id TEXT NOT NULL REFERENCES homework_attachments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (attachment_id, student_id)
);

CREATE INDEX IF NOT EXISTS homework_attachment_recipients_student_idx ON homework_attachment_recipients(student_id, attachment_id);
