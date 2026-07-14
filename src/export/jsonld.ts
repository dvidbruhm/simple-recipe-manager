import type { Recipe } from "@/recipes/repository";
import type { RecipeWithTags } from "./markdown";

export interface JsonLdRecipe {
	"@context": string;
	"@type": string;
	"@id"?: string;
	name: string;
	description: string;
	image: string;
	recipeIngredient: string[];
	recipeInstructions: { "@type": "HowToStep"; text: string }[];
	recipeCategory: string;
	keywords: string;
	recipeYield: string;
	datePublished?: string;
	aggregateRating?: {
		"@type": "AggregateRating";
		ratingValue: number;
		ratingCount: number;
	};
	"x-recipe-manager-notes"?: string;
}

export function recipeToJsonLd(r: RecipeWithTags): JsonLdRecipe {
	const obj: JsonLdRecipe = {
		"@context": "https://schema.org",
		"@type": "Recipe",
		name: r.title,
		description: r.description,
		image: r.image_filename ? `images/${r.image_filename}` : "",
		recipeIngredient: r.ingredients,
		recipeInstructions: r.steps.map((text) => ({ "@type": "HowToStep", text })),
		recipeCategory: "",
		keywords: r.tags.join(","),
		recipeYield: "",
	};
	if (r.source_url) {
		try {
			new URL(r.source_url);
			obj["@id"] = r.source_url;
		} catch {
			// source_url is not a valid URL; skip @id
		}
	}
	if (r.created_at) {
		obj.datePublished = r.created_at;
	}
	if (r.rating > 0) {
		obj.aggregateRating = {
			"@type": "AggregateRating",
			ratingValue: r.rating,
			ratingCount: 1,
		};
	}
	if (r.notes) {
		obj["x-recipe-manager-notes"] = r.notes;
	}
	return obj;
}

export function jsonLdFilename(r: Recipe, index: number): string {
	const safe =
		(r.title || "untitled")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "untitled";
	return `${String(index + 1).padStart(3, "0")}-${safe}.jsonld`;
}
