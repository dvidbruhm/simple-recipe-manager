CREATE TABLE IF NOT EXISTS recipes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  ingredients     TEXT NOT NULL DEFAULT '[]',
  steps           TEXT NOT NULL DEFAULT '[]',
  notes           TEXT NOT NULL DEFAULT '',
  source_url      TEXT NOT NULL DEFAULT '',
  image_filename  TEXT,
  rating          INTEGER NOT NULL DEFAULT 0,
  favorite        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_deleted_at ON recipes(deleted_at);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE
);

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