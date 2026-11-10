CREATE TABLE storage_migration_objects (
  job_id uuid NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  key text NOT NULL,
  size bigint NOT NULL CHECK (size >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  copied boolean NOT NULL DEFAULT false,
  PRIMARY KEY (job_id, key)
);
