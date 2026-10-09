// Idempotent schema, applied automatically on the first query of each server instance.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS lists (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          uuid PRIMARY KEY,
  list_id     uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    text NOT NULL,
  category    text NOT NULL,
  notes       text,
  status      text NOT NULL CHECK (status IN ('open', 'bought')),
  added_by    text NOT NULL,
  bought_at   timestamptz,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS items_list_status_idx ON items (list_id, status);

-- Failed sign-in attempts, used for rate limiting. The key column is a salted hash, never a raw IP.
CREATE TABLE IF NOT EXISTS auth_attempts (
  kind  text NOT NULL,
  key   text NOT NULL,
  at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_attempts_kind_at_idx ON auth_attempts (kind, at);
`;
