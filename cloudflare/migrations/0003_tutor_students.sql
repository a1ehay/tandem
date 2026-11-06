CREATE TABLE IF NOT EXISTS tutor_students (
  tutor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tutor_id, student_id)
);

CREATE INDEX IF NOT EXISTS tutor_students_student_id_idx ON tutor_students(student_id);
