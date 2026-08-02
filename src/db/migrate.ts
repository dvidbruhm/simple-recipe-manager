import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "schema.sql");
const CURRENT_VERSION = "3";

function hasTable(db: Database, name: string): boolean {
	const row = db
		.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
		.get(name) as { name: string } | null;
	return row !== null;
}

function hasColumn(db: Database, table: string, column: string): boolean {
	const row = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return row.some((r) => r.name === column);
}

function schemaVersion(db: Database): string | null {
	if (!hasTable(db, "schema_meta")) return null;
	const row = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
		value: string;
	} | null;
	return row?.value ?? null;
}

function setSchemaVersion(db: Database, version: string): void {
	db.query(
		"INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
	).run(version);
}

/**
 * Destructive migration from the v1 schema (shared-password model, no users)
 * to the v2 schema (per-user accounts with owner_id on recipes and tags).
 *
 * Per design decision: existing recipe data is wiped on upgrade.
 */
function migrateV1toV2(db: Database): void {
	db.exec("BEGIN");
	try {
		db.exec("DROP TRIGGER IF EXISTS recipes_ai");
		db.exec("DROP TRIGGER IF EXISTS recipes_ad");
		db.exec("DROP TRIGGER IF EXISTS recipes_au");
		db.exec("DROP TABLE IF EXISTS recipes_fts");
		db.exec("DROP TABLE IF EXISTS recipe_tags");
		db.exec("DROP TABLE IF EXISTS tags");
		db.exec("DROP TABLE IF EXISTS recipes");
		db.exec("COMMIT");
	} catch (e) {
		db.exec("ROLLBACK");
		throw e;
	}
}

export function migrate(db: Database): void {
	const version = schemaVersion(db);

	if (version === null) {
		const hasUsers = hasTable(db, "users");
		const hasRecipes = hasTable(db, "recipes");
		if (!hasUsers && hasRecipes) {
			migrateV1toV2(db);
		}
	}

	const sql = readFileSync(SCHEMA_PATH, "utf-8");
	db.exec(sql);

	if (hasTable(db, "recipes") && !hasColumn(db, "recipes", "base_servings")) {
		db.exec("ALTER TABLE recipes ADD COLUMN base_servings INTEGER");
	}

	setSchemaVersion(db, CURRENT_VERSION);
}
