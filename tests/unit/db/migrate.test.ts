import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";

describe("migrate", () => {
	it("creates all required tables including users + tokens + FTS virtual table", () => {
		const db = new Database(":memory:");
		migrate(db);
		const tables = db
			.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
			.all() as { name: string }[];
		const names = tables.map((t) => t.name);
		expect(names).toContain("users");
		expect(names).toContain("password_reset_tokens");
		expect(names).toContain("recipes");
		expect(names).toContain("tags");
		expect(names).toContain("recipe_tags");
		expect(names).toContain("recipes_fts");
		expect(names).toContain("recipes_fts_data");
		expect(names).toContain("recipes_fts_idx");
		expect(names).toContain("schema_meta");
	});

	it("records schema version 3 after migration", () => {
		const db = new Database(":memory:");
		migrate(db);
		const row = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as
			| { value: string }
			| undefined;
		expect(row?.value).toBe("3");
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
			"INSERT INTO users (email, password_hash, password_salt) VALUES ('a@b.com', 'h', 's')",
		).run();
		db.query(
			"INSERT INTO recipes (owner_id, title, ingredients, steps, description) VALUES (?, ?, ?, ?, ?)",
		).values(1, "Tarte aux pommes", '["pomme"]', '["cuire"]', "dessert");
		const row = db.query("SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH 'pomme'").get();
		expect(row).toBeTruthy();
	});

	it("recipes table includes owner_id, favorite, and base_servings columns", () => {
		const db = new Database(":memory:");
		migrate(db);
		const cols = db.query("PRAGMA table_info(recipes)").all() as { name: string }[];
		const names = cols.map((c) => c.name);
		expect(names).toContain("owner_id");
		expect(names).toContain("favorite");
		expect(names).toContain("base_servings");
	});

	it("tags table includes owner_id", () => {
		const db = new Database(":memory:");
		migrate(db);
		const cols = db.query("PRAGMA table_info(tags)").all() as { name: string }[];
		const names = cols.map((c) => c.name);
		expect(names).toContain("owner_id");
	});

	it("destructive upgrade: v1 schema without users table drops recipes and recreates with owner_id", () => {
		const db = new Database(":memory:");
		db.exec(
			`CREATE TABLE recipes (id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
			  created_at TEXT NOT NULL DEFAULT (datetime('now')),
			  updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT)`,
		);
		db.exec("INSERT INTO recipes (title) VALUES ('old')");
		migrate(db);
		const count = db.query("SELECT COUNT(*) AS c FROM recipes").get() as { c: number };
		expect(count.c).toBe(0);
		const cols = db.query("PRAGMA table_info(recipes)").all() as { name: string }[];
		expect(cols.map((c) => c.name)).toContain("owner_id");
		const usersTable = db
			.query("SELECT name FROM sqlite_master WHERE type='table' AND name = 'users'")
			.get() as { name: string } | undefined;
		expect(usersTable?.name).toBe("users");
	});
});
