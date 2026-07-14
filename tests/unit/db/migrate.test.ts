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
});
