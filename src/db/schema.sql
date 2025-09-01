CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY,
  owner_username TEXT NOT NULL,
  original_path TEXT NOT NULL,
  width INT,
  height INT,
  format TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS images_created_at_idx ON images (created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  params JSONB,
  cpu_ms INT,
  result_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);


