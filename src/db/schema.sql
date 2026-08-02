CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  used_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  ingredients     TEXT NOT NULL DEFAULT '[]',
  steps           TEXT NOT NULL DEFAULT '[]',
  notes           TEXT NOT NULL DEFAULT '',
  source_url      TEXT NOT NULL DEFAULT '',
  image_filename  TEXT,
  base_servings   INTEGER,
  rating          INTEGER NOT NULL DEFAULT 0,
  favorite        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_id);
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_deleted_at ON recipes(owner_id, deleted_at);

CREATE TABLE IF NOT EXISTS tags (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner_id);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  title,
  ingredients,
  steps,
  description UNINDEXED,
  content='recipes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO recipes_fts(rowid, title, ingredients, steps, description)
  VALUES (new.id, new.title, new.ingredients, new.steps, new.description);
END;
CREATE TRIGGER IF NOT EXISTS recipes_ad AFTER DELETE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, title, ingredients, steps, description)
  VALUES ('delete', old.id, old.title, old.ingredients, old.steps, old.description);
END;
CREATE TRIGGER IF NOT EXISTS recipes_au AFTER UPDATE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, title, ingredients, steps, description)
  VALUES ('delete', old.id, old.title, old.ingredients, old.steps, old.description);
  INSERT INTO recipes_fts(rowid, title, ingredients, steps, description)
  VALUES (new.id, new.title, new.ingredients, new.steps, new.description);
END;
