-- External-identity accounts (now Kinde): no password, provider provenance.
-- Existing rows keep working: provider defaults to 'local', and every
-- existing password_hash is non-null so the new nullability changes nothing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
