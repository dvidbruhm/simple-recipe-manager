import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";

describe("migrate", () => {
	it("creates all required tables and the FTS virtual table", () => {
		const db = new Database(":memory:");
		migrate(db);
		const tables = db
			.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
			.all() as { name: string }[];
		const names = tables.map((t) => t.name);
		expect(names).toContain("recipes");
		expect(names).toContain("tags");
		expect(names).toContain("recipe_tags");
		expect(names).toContain("recipes_fts");
		expect(names).toContain("recipes_fts_data");
		expect(names).toContain("recipes_fts_idx");
	});

	it("is idempotent: running twice does not error", () => {
		const db = new Database(":memory:");
		migrate(db);
		expect(() => migrate(db)).not.toThrow();
	});

	it("creates the FTS triggers", () => {
		const db = new Database(":memory:");
		migrate(db);
		const triggers = db
			.query("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
			.all() as { name: string }[];
		const names = triggers.map((t) => t.name);
		expect(names).toContain("recipes_ai");
		expect(names).toContain("recipes_ad");
		expect(names).toContain("recipes_au");
	});

	it("inserting a recipe populates FTS auto-sync", () => {
		const db = new Database(":memory:");
		migrate(db);
		db.query(
			"INSERT INTO recipes (title, ingredients, steps, description) VALUES (?, ?, ?, ?)",
		).values("Tarte aux pommes", '["pomme"]', '["cuire"]', "dessert");
		const row = db.query("SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH 'pomme'").get();
		expect(row).toBeTruthy();
	});

	it("adds the favorite column and backfills it on an existing database", () => {
		const db = new Database(":memory:");
		db.exec(
			`CREATE TABLE recipes (id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
			  created_at TEXT NOT NULL DEFAULT (datetime('now')),
			  updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT)`,
		);
		db.exec("INSERT INTO recipes (title) VALUES ('old')");
		migrate(db);
		const cols = db.query("PRAGMA table_info(recipes)").all() as { name: string }[];
		expect(cols.map((c) => c.name)).toContain("favorite");
		const row = db.query("SELECT favorite FROM recipes WHERE title = 'old'").get() as {
			favorite: number;
		};
		expect(row.favorite).toBe(0);
	});
});
