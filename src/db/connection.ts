import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { migrate } from "./migrate";

export function openDatabase(dataDir: string): Database {
	mkdirSync(`${dataDir}/images`, { recursive: true });
	const db = new Database(`${dataDir}/recipes.db`);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA synchronous = NORMAL");
	migrate(db);
	return db;
}
