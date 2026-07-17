import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";

function setup() {
	const db = new Database(":memory:");
	migrate(db);
	return new RecipeRepository(db);
}

describe("RecipeRepository", () => {
	it("inserts and retrieves a recipe", () => {
		const repo = setup();
		const id = repo.insert({
			title: "T",
			description: "d",
			ingredients: ["flour"],
			steps: ["bake"],
			source_url: "http://x",
		});
		const r = repo.getById(id);
		expect(r).toBeTruthy();
		expect(r?.title).toBe("T");
		expect(r?.ingredients).toEqual(["flour"]);
	});

	it("lists active recipes, excluding soft-deleted", () => {
		const repo = setup();
		const id1 = repo.insert({ title: "A" });
		repo.insert({ title: "B" });
		repo.softDelete(id1);
		const list = repo.list();
		expect(list.map((r) => r.title)).toEqual(["B"]);
		expect(list.length).toBe(1);
	});

	it("updates an existing recipe", () => {
		const repo = setup();
		const id = repo.insert({ title: "Before" });
		repo.update(id, { title: "After", rating: 5 });
		const r = repo.getById(id);
		expect(r?.title).toBe("After");
		expect(r?.rating).toBe(5);
	});

	it("soft-deletes and restores", () => {
		const repo = setup();
		const id = repo.insert({ title: "X" });
		repo.softDelete(id);
		expect(repo.list().find((r) => r.id === id)).toBeUndefined();
		repo.restore(id);
		expect(repo.list().find((r) => r.id === id)).toBeTruthy();
	});

	it("soft-deletes many recipes at once", () => {
		const repo = setup();
		const a = repo.insert({ title: "A" });
		repo.insert({ title: "B" });
		const c = repo.insert({ title: "C" });
		repo.softDeleteMany([a, c]);
		expect(repo.list().map((r) => r.title)).toEqual(["B"]);
	});

	it("restores many recipes at once and ignores empty input", () => {
		const repo = setup();
		const a = repo.insert({ title: "A" });
		const b = repo.insert({ title: "B" });
		repo.softDeleteMany([a, b]);
		expect(repo.list()).toHaveLength(0);
		repo.restoreMany([a, b]);
		expect(
			repo
				.list()
				.map((r) => r.title)
				.sort(),
		).toEqual(["A", "B"]);
		repo.restoreMany([]);
		expect(repo.list()).toHaveLength(2);
	});
});
