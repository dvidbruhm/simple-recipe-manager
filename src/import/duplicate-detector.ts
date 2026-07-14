import type { Database } from "bun:sqlite";
import type { PartialRecipe } from "./extractor";
import { normalizeTitle } from "./file-importers/normalize";

export type DetectionResult =
	| { status: "new" }
	| { status: "duplicate"; existingId: number; reason: string };

interface ExistingRecipe {
	id: number;
	title: string;
	source_url: string;
	ingredients: string;
}

export function detectDuplicates(db: Database, incoming: PartialRecipe[]): DetectionResult[] {
	const bySourceUrl = new Map<string, number>();
	const byNormalizedTitle = new Map<string, ExistingRecipe>();

	const rows = db
		.query("SELECT id, title, source_url, ingredients FROM recipes WHERE deleted_at IS NULL")
		.all() as ExistingRecipe[];

	for (const r of rows) {
		if (r.source_url) {
			bySourceUrl.set(r.source_url, r.id);
		}
		const norm = normalizeTitle(r.title);
		if (norm) {
			byNormalizedTitle.set(norm, r);
		}
	}

	return incoming.map((recipe) => {
		if (recipe.source_url) {
			const existingId = bySourceUrl.get(recipe.source_url);
			if (existingId !== undefined) {
				return {
					status: "duplicate" as const,
					existingId,
					reason: `source_url match: ${recipe.source_url}`,
				};
			}
		}

		if (recipe.title) {
			const norm = normalizeTitle(recipe.title);
			const candidate = norm ? byNormalizedTitle.get(norm) : undefined;
			if (candidate) {
				const firstExistingIng = parseFirstIngredient(candidate.ingredients);
				const firstIncomingIng = recipe.ingredients?.[0] ?? "";
				const bothEmpty = firstExistingIng === "" && firstIncomingIng === "";
				const bothEqual =
					firstExistingIng !== "" &&
					firstIncomingIng !== "" &&
					firstExistingIng.toLowerCase() === firstIncomingIng.toLowerCase();
				if (bothEmpty || bothEqual) {
					return {
						status: "duplicate" as const,
						existingId: candidate.id,
						reason: `title match: "${candidate.title}"`,
					};
				}
			}
		}

		return { status: "new" as const };
	});
}

function parseFirstIngredient(ingredientsJson: string): string {
	try {
		const arr = JSON.parse(ingredientsJson);
		if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") {
			return arr[0];
		}
	} catch {
		return "";
	}
	return "";
}

export type { Recipe } from "@/recipes/repository";
