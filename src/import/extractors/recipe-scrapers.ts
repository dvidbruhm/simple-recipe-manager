import { type RecipeObject, scrapeRecipe } from "recipe-scrapers";

export interface ExtractedRecipe {
	title: string;
	description: string;
	ingredients: string[];
	steps: string[];
	image: string | null;
}

export async function trySchemaExtract(url: string, html: string): Promise<ExtractedRecipe | null> {
	try {
		const safe = await scrapeRecipe(html, url, { safeParse: true });
		if (!safe.success) return null;
		const r: RecipeObject = safe.data;
		if (!r.title) return null;
		const ingredients = r.ingredients.flatMap((g) => g.items.map((i) => i.value).filter(Boolean));
		const steps = r.instructions.flatMap((g) => g.items.map((i) => i.value).filter(Boolean));
		if (ingredients.length === 0 && steps.length === 0) return null;
		return {
			title: r.title,
			description: r.description ?? "",
			ingredients,
			steps,
			image: r.image || null,
		};
	} catch {
		return null;
	}
}
