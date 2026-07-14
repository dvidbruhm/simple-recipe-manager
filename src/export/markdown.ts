import type { Recipe } from "@/recipes/repository";

export interface RecipeWithTags extends Recipe {
	tags: string[];
}

function yamlEscape(s: string): string {
	return `"${(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function filenameSafe(s: string): string {
	return (
		(s || "untitled")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "untitled"
	);
}

function stars(rating: number): string {
	return "★".repeat(Math.max(0, Math.min(5, rating)));
}

export function renderRecipeMarkdown(r: RecipeWithTags): string {
	const lines: string[] = [];
	lines.push("---");
	lines.push(`title: ${yamlEscape(r.title)}`);
	lines.push(`source_url: ${yamlEscape(r.source_url)}`);
	lines.push(`rating: ${r.rating}`);
	lines.push(`stars: ${yamlEscape(stars(r.rating))}`);
	lines.push(`tags: [${r.tags.map(yamlEscape).join(", ")}]`);
	lines.push(`created_at: ${yamlEscape(r.created_at)}`);
	lines.push(`image: ${r.image_filename ? yamlEscape(`images/${r.image_filename}`) : '""'}`);
	lines.push("---");
	lines.push("");
	lines.push(`# ${r.title}`);
	lines.push("");
	if (r.description) {
		lines.push(r.description);
		lines.push("");
	}
	if (r.ingredients.length > 0) {
		lines.push("## Ingredients");
		lines.push("");
		for (const ing of r.ingredients) {
			lines.push(`- ${ing}`);
		}
		lines.push("");
	}
	if (r.steps.length > 0) {
		lines.push("## Steps");
		lines.push("");
		r.steps.forEach((s, i) => {
			lines.push(`${i + 1}. ${s}`);
		});
		lines.push("");
	}
	if (r.notes) {
		lines.push("## Notes");
		lines.push("");
		lines.push(r.notes);
		lines.push("");
	}
	return lines.join("\n");
}

export function recipeFilename(r: Recipe, index: number): string {
	return `${String(index + 1).padStart(3, "0")}-${filenameSafe(r.title)}.md`;
}
