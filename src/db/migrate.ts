import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "schema.sql");

export function migrate(db: Database): void {
	const sql = readFileSync(SCHEMA_PATH, "utf-8");
	db.exec(sql);
	const cols = db.query("PRAGMA table_info(recipes)").all() as { name: string }[];
	if (!cols.some((c) => c.name === "favorite")) {
		db.exec("ALTER TABLE recipes ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
	}
}
