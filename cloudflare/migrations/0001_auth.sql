CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  role TEXT CHECK (role IN ('tutor', 'student')),
  name TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'light',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google', 'yandex', 'vk')),
  provider_subject TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (account_id, provider)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS account_data (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
