import { Database } from "bun:sqlite";
import { hashPassword } from "@/auth/password";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";

function setup() {
	const db = new Database(":memory:");
	migrate(db);
	const result = db
		.query("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) RETURNING id")
		.get("u@x.com", ...(Object.values(hashPassword("pw")) as [string, string])) as {
		id: number;
	};
	const userId = result.id;
	return {
		db,
		userId,
		recipes: new RecipeRepository(db, userId),
		tags: new TagRepository(db, userId),
	};
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

	it("isolation: tags are not shared across users", () => {
		const { db, userId, recipes, tags } = setup();
		const other = db
			.query(
				"INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) RETURNING id",
			)
			.get("b@x.com", "h", "s") as { id: number };
		const recipesB = new RecipeRepository(db, other.id);
		const tagsB = new TagRepository(db, other.id);

		const idA = recipes.insert({ title: "A" });
		tags.replaceForRecipe(idA, ["secret-a"]);
		const idB = recipesB.insert({ title: "B" });
		tagsB.replaceForRecipe(idB, ["secret-b"]);

		expect(tags.autocomplete("secret-")).toEqual(["secret-a"]);
		expect(tagsB.autocomplete("secret-")).toEqual(["secret-b"]);
		expect(tags.listAllWithCounts().map((t) => t.name)).toEqual(["secret-a"]);
		void userId;
	});
});
