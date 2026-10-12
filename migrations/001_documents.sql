CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled' CHECK (length(title) BETWEEN 1 AND 240),
  content JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents(updated_at DESC);
