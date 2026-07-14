import type { Database } from "bun:sqlite";

export interface TagWithCount {
	name: string;
	cnt: number;
}

export class TagRepository {
	constructor(private db: Database) {}

	replaceForRecipe(recipeId: number, names: string[]): void {
		this.db.exec("BEGIN");
		try {
			this.db.query("DELETE FROM recipe_tags WHERE recipe_id = ?").run(recipeId);
			for (const rawName of names) {
				const name = rawName.trim();
				if (!name) continue;
				this.db.query("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(name);
				const row = this.db
					.query("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
					.get(name) as { id: number } | null;
				if (row) {
					this.db
						.query("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)")
						.run(recipeId, row.id);
				}
			}
			this.db.exec("COMMIT");
		} catch (e) {
			this.db.exec("ROLLBACK");
			throw e;
		}
	}

	listForRecipe(recipeId: number): { id: number; name: string }[] {
		const rows = this.db
			.query(
				`SELECT t.id, t.name FROM tags t
				 JOIN recipe_tags rt ON rt.tag_id = t.id
				 WHERE rt.recipe_id = ?
				 ORDER BY t.name COLLATE NOCASE`,
			)
			.all(recipeId) as { id: number; name: string }[];
		return rows;
	}

	listAllWithCounts(): TagWithCount[] {
		const rows = this.db
			.query(
				`SELECT t.name AS name, COUNT(r.id) AS cnt
				 FROM tags t
				 LEFT JOIN recipe_tags rt ON rt.tag_id = t.id
				 LEFT JOIN recipes r ON r.id = rt.recipe_id AND r.deleted_at IS NULL
				 GROUP BY t.id
				 ORDER BY cnt DESC, t.name COLLATE NOCASE`,
			)
			.all() as TagWithCount[];
		return rows;
	}

	autocomplete(q: string): string[] {
		const like = `${q.toLowerCase()}%`;
		const rows = this.db
			.query("SELECT name FROM tags WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 10")
			.all(like) as { name: string }[];
		return rows.map((r) => r.name);
	}
}
