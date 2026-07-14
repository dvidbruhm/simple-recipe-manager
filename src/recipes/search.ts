import type { Database } from "bun:sqlite";
import { deserializeRecipe, type Recipe } from "./repository";

export interface SearchParams {
	q?: string;
	tag?: string;
}

function sanitizeFtsQuery(q: string): string {
	const tokens: string[] = [];
	for (const raw of q.split(/\s+/)) {
		const word = raw.trim();
		if (!word) continue;
		const escaped = word.replace(/"/g, '""');
		tokens.push(`"${escaped}"*`);
	}
	return tokens.join(" ");
}

export function searchRecipes(db: Database, params: SearchParams): Recipe[] {
	const q = (params.q ?? "").trim();
	const tag = (params.tag ?? "").trim();

	const hasQ = q.length > 0;
	const hasTag = tag.length > 0;

	let rows: Record<string, unknown>[];

	if (hasQ && hasTag) {
		const match = sanitizeFtsQuery(q);
		if (!match) {
			rows = [];
		} else {
			rows = db
				.prepare(
					`SELECT r.* FROM recipes r
					 JOIN (SELECT rowid AS rid, rank FROM recipes_fts WHERE recipes_fts MATCH ?) f
					   ON f.rid = r.id
					 WHERE r.deleted_at IS NULL
					   AND r.id IN (
					     SELECT rt.recipe_id FROM recipe_tags rt
					     JOIN tags t ON t.id = rt.tag_id
					     WHERE t.name = ? COLLATE NOCASE
					   )
					 ORDER BY f.rank`,
				)
				.all(match, tag) as Record<string, unknown>[];
		}
	} else if (hasQ) {
		const match = sanitizeFtsQuery(q);
		if (!match) {
			rows = [];
		} else {
			rows = db
				.prepare(
					`SELECT r.* FROM recipes r
					 JOIN (SELECT rowid AS rid, rank FROM recipes_fts WHERE recipes_fts MATCH ?) f
					   ON f.rid = r.id
					 WHERE r.deleted_at IS NULL
					 ORDER BY f.rank`,
				)
				.all(match) as Record<string, unknown>[];
		}
	} else if (hasTag) {
		rows = db
			.prepare(
				`SELECT r.* FROM recipes r
				 WHERE r.deleted_at IS NULL
				   AND r.id IN (
				     SELECT rt.recipe_id FROM recipe_tags rt
				     JOIN tags t ON t.id = rt.tag_id
				     WHERE t.name = ? COLLATE NOCASE
				   )
				 ORDER BY r.created_at DESC`,
			)
			.all(tag) as Record<string, unknown>[];
	} else {
		rows = [];
	}

	return rows.map((r) => deserializeRecipe(r));
}
