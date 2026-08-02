import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { RecipeInput } from "./forms";

export interface Recipe {
	id: number;
	owner_id: number;
	title: string;
	description: string;
	ingredients: string[];
	steps: string[];
	notes: string;
	source_url: string;
	image_filename: string | null;
	base_servings: number | null;
	rating: number;
	favorite: boolean;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export function deserializeRecipe(row: Record<string, unknown>): Recipe {
	return {
		id: row.id as number,
		owner_id: row.owner_id as number,
		title: row.title as string,
		description: row.description as string,
		ingredients: JSON.parse((row.ingredients as string) || "[]"),
		steps: JSON.parse((row.steps as string) || "[]"),
		notes: row.notes as string,
		source_url: row.source_url as string,
		image_filename: (row.image_filename as string | null) ?? null,
		base_servings: (row.base_servings as number | null) ?? null,
		rating: row.rating as number,
		favorite: Boolean(row.favorite),
		created_at: row.created_at as string,
		updated_at: row.updated_at as string,
		deleted_at: (row.deleted_at as string | null) ?? null,
	};
}

export class RecipeRepository {
	constructor(
		private db: Database,
		private ownerId: number,
	) {}

	insert(input: RecipeInput): number {
		const stmt = this.db.query(
			`INSERT INTO recipes (owner_id, title, description, ingredients, steps, notes, source_url, image_filename, base_servings, rating, favorite)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		const result = stmt.run(
			this.ownerId,
			input.title ?? "",
			input.description ?? "",
			JSON.stringify(input.ingredients ?? []),
			JSON.stringify(input.steps ?? []),
			input.notes ?? "",
			input.source_url ?? "",
			input.image_filename ?? null,
			input.base_servings ?? null,
			input.rating ?? 0,
			input.favorite ? 1 : 0,
		);
		return Number(result.lastInsertRowid);
	}

	getById(id: number): Recipe | null {
		const row = this.db
			.query("SELECT * FROM recipes WHERE id = ? AND owner_id = ?")
			.get(id, this.ownerId) as Record<string, unknown> | null;
		if (!row) return null;
		return deserializeRecipe(row);
	}

	list(): Recipe[] {
		const rows = this.db
			.query(
				"SELECT * FROM recipes WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
			)
			.all(this.ownerId) as Record<string, unknown>[];
		return rows.map((r) => deserializeRecipe(r));
	}

	update(id: number, patch: Partial<RecipeInput>): void {
		const cols: string[] = [];
		const vals: SQLQueryBindings[] = [];
		for (const [k, v] of Object.entries(patch)) {
			if (k === "ingredients" || k === "steps") {
				cols.push(`${k} = ?`);
				vals.push(JSON.stringify(v ?? []));
			} else if (k === "favorite") {
				cols.push(`${k} = ?`);
				vals.push(v ? 1 : 0);
			} else {
				cols.push(`${k} = ?`);
				vals.push((v ?? null) as SQLQueryBindings);
			}
		}
		cols.push("updated_at = datetime('now')");
		vals.push(id, this.ownerId);
		this.db
			.prepare(`UPDATE recipes SET ${cols.join(", ")} WHERE id = ? AND owner_id = ?`)
			.run(...vals);
	}

	softDelete(id: number): void {
		this.db
			.prepare("UPDATE recipes SET deleted_at = datetime('now') WHERE id = ? AND owner_id = ?")
			.run(id, this.ownerId);
	}

	restore(id: number): void {
		this.db
			.prepare("UPDATE recipes SET deleted_at = NULL WHERE id = ? AND owner_id = ?")
			.run(id, this.ownerId);
	}

	softDeleteMany(ids: number[]): void {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(", ");
		this.db
			.prepare(
				`UPDATE recipes SET deleted_at = datetime('now')
				 WHERE owner_id = ? AND id IN (${placeholders})`,
			)
			.run(this.ownerId, ...ids);
	}

	restoreMany(ids: number[]): void {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(", ");
		this.db
			.prepare(
				`UPDATE recipes SET deleted_at = NULL
				 WHERE owner_id = ? AND id IN (${placeholders})`,
			)
			.run(this.ownerId, ...ids);
	}

	countFavorites(): number {
		const row = this.db
			.query(
				"SELECT COUNT(*) AS c FROM recipes WHERE owner_id = ? AND favorite = 1 AND deleted_at IS NULL",
			)
			.get(this.ownerId) as { c: number };
		return row.c;
	}
}
