-- The sample and early OAuth profiles are intentionally removed as requested.
DELETE FROM sessions;
DELETE FROM oauth_identities;
DELETE FROM account_data;
DELETE FROM accounts;

ALTER TABLE accounts ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique_idx ON accounts(email COLLATE NOCASE) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS email_verification_account_idx ON email_verification_tokens(account_id);
CREATE INDEX IF NOT EXISTS email_verification_expiry_idx ON email_verification_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_account_idx ON password_reset_tokens(account_id);
CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at);
