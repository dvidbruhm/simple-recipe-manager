import type { Database } from "bun:sqlite";
import { deserializeRecipe, type Recipe } from "./repository";

export interface SearchParams {
	q?: string;
	tags?: string[];
	favorite?: boolean;
	ownerId: number;
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
	const tags = (params.tags ?? []).map((t) => t.trim()).filter(Boolean);
	const favOnly = params.favorite === true;
	const ownerId = params.ownerId;

	const hasQ = q.length > 0;
	const hasTags = tags.length > 0;
	const hasFav = favOnly;

	const favCond = hasFav ? "AND r.favorite = 1" : "";
	const placeholders = tags.map(() => "?").join(",");
	const tagSubquery = `(
	     SELECT rt.recipe_id FROM recipe_tags rt
	     JOIN tags t ON t.id = rt.tag_id
	     WHERE t.owner_id = ?
	       AND t.name COLLATE NOCASE IN (${placeholders})
	   )`;

	let rows: Record<string, unknown>[];

	if (hasQ && hasTags) {
		const match = sanitizeFtsQuery(q);
		if (!match) {
			rows = [];
		} else {
			rows = db
				.prepare(
					`SELECT DISTINCT r.* FROM recipes r
					 JOIN (SELECT rowid AS rid, rank FROM recipes_fts WHERE recipes_fts MATCH ?) f
					   ON f.rid = r.id
					 WHERE r.owner_id = ?
					   AND r.deleted_at IS NULL
					   AND r.id IN ${tagSubquery}
					   ${favCond}
					 ORDER BY f.rank`,
				)
				.all(match, ownerId, ownerId, ...tags) as Record<string, unknown>[];
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
					 WHERE r.owner_id = ?
					   AND r.deleted_at IS NULL
					   ${favCond}
					 ORDER BY f.rank`,
				)
				.all(match, ownerId) as Record<string, unknown>[];
		}
	} else if (hasTags) {
		rows = db
			.prepare(
				`SELECT DISTINCT r.* FROM recipes r
				 WHERE r.owner_id = ?
				   AND r.deleted_at IS NULL
				   AND r.id IN ${tagSubquery}
				   ${favCond}
				 ORDER BY r.created_at DESC`,
			)
			.all(ownerId, ownerId, ...tags) as Record<string, unknown>[];
	} else if (hasFav) {
		rows = db
			.prepare(
				`SELECT r.* FROM recipes r
				 WHERE r.owner_id = ?
				   AND r.deleted_at IS NULL
				   AND r.favorite = 1
				 ORDER BY r.created_at DESC`,
			)
			.all(ownerId) as Record<string, unknown>[];
	} else {
		rows = [];
	}

	return rows.map((r) => deserializeRecipe(r));
}

export function sortRecipes(list: Recipe[], sort: string): Recipe[] {
	const sorted = [...list];
	switch (sort) {
		case "name-asc":
			return sorted.sort((a, b) => a.title.localeCompare(b.title));
		case "name-desc":
			return sorted.sort((a, b) => b.title.localeCompare(a.title));
		case "date-old":
			return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
		case "date-new":
			return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
		case "rating-asc":
			return sorted.sort((a, b) => a.rating - b.rating);
		case "rating-desc":
			return sorted.sort((a, b) => b.rating - a.rating);
		default:
			return list;
	}
}
