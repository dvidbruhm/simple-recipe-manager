import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";

function setup() {
	const db = new Database(":memory:");
	migrate(db);
	return { db, recipes: new RecipeRepository(db), tags: new TagRepository(db) };
}

describe("TagRepository", () => {
	it("replaceForRecipe writes and updates tags atomically", () => {
		const { recipes, tags } = setup();
		const id = recipes.insert({ title: "X", ingredients: [], steps: [] });
		tags.replaceForRecipe(id, ["dessert", "italian"]);
		expect(
			tags
				.listForRecipe(id)
				.map((t) => t.name)
				.sort(),
		).toEqual(["dessert", "italian"]);
		tags.replaceForRecipe(id, ["dessert", "french"]);
		expect(
			tags
				.listForRecipe(id)
				.map((t) => t.name)
				.sort(),
		).toEqual(["dessert", "french"]);
	});

	it("listAllWithCounts returns counts excluding deleted recipes", () => {
		const { recipes, tags } = setup();
		const id1 = recipes.insert({ title: "A" });
		const id2 = recipes.insert({ title: "B" });
		tags.replaceForRecipe(id1, ["dessert"]);
		tags.replaceForRecipe(id2, ["dessert", "italian"]);
		recipes.softDelete(id2);
		const list = tags.listAllWithCounts();
		expect(list).toContainEqual({ name: "dessert", cnt: 1 });
		expect(list.find((t) => t.name === "italian")?.cnt).toBe(0);
	});

	it("autocomplete returns case-insensitive matches", () => {
		const { recipes, tags } = setup();
		const id = recipes.insert({ title: "X" });
		tags.replaceForRecipe(id, ["Dessert"]);
		const res = tags.autocomplete("des");
		expect(res.map((t) => t.toLowerCase())).toContain("dessert");
	});

	it("unused tags are not deleted (keep history for tag chips)", () => {
		const { recipes, tags } = setup();
		const id = recipes.insert({ title: "X" });
		tags.replaceForRecipe(id, ["rare"]);
		tags.replaceForRecipe(id, []);
		const list = tags.listAllWithCounts();
		expect(list.find((t) => t.name === "rare")).toBeTruthy();
	});
});
