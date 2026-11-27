CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY,
  filename TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('demo','import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  description VARCHAR(200) NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0 AND amount_cents <= 100000000),
  category VARCHAR(60) NOT NULL,
  import_id UUID NOT NULL REFERENCES imports(id)
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions(category);
