-- Tandem initial schema. PostgreSQL 13+.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL UNIQUE,
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
    role text NOT NULL CHECK (role IN ('tutor', 'student')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    grade_label text CHECK (grade_label IS NULL OR char_length(grade_label) <= 80),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tutor_subscriptions (
    tutor_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_code text NOT NULL CHECK (plan_code IN ('light', 'extreme')),
    status text NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    period_ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tutor_students (
    tutor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    student_id uuid NOT NULL REFERENCES student_profiles(user_id) ON DELETE RESTRICT,
    subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 120),
    grade_label text CHECK (grade_label IS NULL OR char_length(grade_label) <= 80),
    private_note text NOT NULL DEFAULT '',
    progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tutor_id, student_id)
);

CREATE TABLE boards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_tutor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    elements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(elements) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lessons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL,
    student_id uuid NOT NULL,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    starts_at timestamptz NOT NULL,
    duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'in_progress', 'completed', 'canceled', 'no_show')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lessons_tutor_student_fk FOREIGN KEY (tutor_id, student_id)
        REFERENCES tutor_students(tutor_id, student_id) ON DELETE RESTRICT
);

CREATE TABLE lesson_boards (
    lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    board_id uuid NOT NULL REFERENCES boards(id) ON DELETE RESTRICT,
    attached_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lesson_id, board_id)
);

CREATE TABLE tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    student_id uuid,
    kind text NOT NULL CHECK (kind IN ('personal', 'homework')),
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '',
    subject text CHECK (subject IS NULL OR char_length(subject) <= 120),
    due_at timestamptz,
    status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'submitted', 'complete')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tasks_tutor_student_fk FOREIGN KEY (tutor_id, student_id)
        REFERENCES tutor_students(tutor_id, student_id) ON DELETE RESTRICT,
    CONSTRAINT tasks_kind_student_status_chk CHECK (
        (kind = 'personal' AND student_id IS NULL AND status IN ('todo', 'complete')) OR
        (kind = 'homework' AND student_id IS NOT NULL)
    )
);

CREATE TABLE planners (
    owner_tutor_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'План на неделю' CHECK (char_length(title) <= 160),
    blocks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocks) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lessons_tutor_schedule_idx ON lessons (tutor_id, starts_at);
CREATE INDEX lessons_student_schedule_idx ON lessons (student_id, starts_at);
CREATE INDEX tasks_tutor_status_due_idx ON tasks (tutor_id, status, due_at);
CREATE INDEX tasks_student_status_due_idx ON tasks (student_id, status, due_at)
    WHERE student_id IS NOT NULL;
CREATE INDEX boards_owner_updated_idx ON boards (owner_tutor_id, updated_at DESC);
