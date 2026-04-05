CREATE TABLE IF NOT EXISTS challenge_definitions (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'challenge' CHECK (kind IN ('challenge')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  public_url TEXT,
  content_format TEXT NOT NULL DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'html')),
  content TEXT NOT NULL,
  source_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_definitions_active ON challenge_definitions(active);
CREATE INDEX IF NOT EXISTS idx_challenge_definitions_kind ON challenge_definitions(kind);

CREATE OR REPLACE FUNCTION set_updated_at_challenge_definitions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_challenge_definitions ON challenge_definitions;
CREATE TRIGGER trg_set_updated_at_challenge_definitions
BEFORE UPDATE ON challenge_definitions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_challenge_definitions();
