import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractRecipe } from "@/import/extractor";

const F = (n: string) => readFileSync(join(import.meta.dir, "../../fixtures", n), "utf-8");

describe("extractRecipe", () => {
	const cases: Array<[string, string]> = [
		[
			"allrecipes.html",
			"https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/",
		],
		["bbcgoodfood.html", "https://www.bbcgoodfood.com/recipes/spaghetti-bolognese"],
		["marmiton.html", "https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx"],
		["g750.html", "https://www.750g.com/tiramisu-r161.htm"],
	];

	for (const [fixture, url] of cases) {
		it(`Layer 1 extracts structured recipe from ${fixture}`, async () => {
			const out = await extractRecipe(url, F(fixture));
			expect(out.kind).toBe("structured");
			if (out.kind === "structured") {
				expect((out.recipe.title ?? "").length).toBeGreaterThan(0);
				expect((out.recipe.ingredients ?? []).length).toBeGreaterThan(0);
			}
		});
	}

	it("Layer 2 (readability) handles no-schema HTML", async () => {
		const out = await extractRecipe("https://example-blog.com", F("no-schema-blog.html"));
		expect(out.kind === "readability" || out.kind === "structured").toBe(true);
		if (out.kind === "readability") {
			expect(out.rawText.length).toBeGreaterThan(100);
		}
	});
});
