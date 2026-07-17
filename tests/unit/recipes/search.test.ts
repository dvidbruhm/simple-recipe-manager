import type { Recipe } from "@/recipes/repository";
import { sortRecipes } from "@/recipes/search";

function make(id: number, title: string, createdAt: string): Recipe {
	return {
		id,
		title,
		description: "",
		ingredients: [],
		steps: [],
		notes: "",
		source_url: "",
		image_filename: null,
		rating: 0,
		favorite: false,
		created_at: createdAt,
		updated_at: createdAt,
		deleted_at: null,
	};
}

const list = [
	make(1, "Zebra", "2024-01-03 10:00:00"),
	make(2, "Apple", "2024-01-01 10:00:00"),
	make(3, "Mango", "2024-01-02 10:00:00"),
];

describe("sortRecipes", () => {
	it("sorts by name ascending (A -> Z)", () => {
		const out = sortRecipes(list, "name-asc").map((r) => r.title);
		expect(out).toEqual(["Apple", "Mango", "Zebra"]);
	});

	it("sorts by name descending (Z -> A)", () => {
		const out = sortRecipes(list, "name-desc").map((r) => r.title);
		expect(out).toEqual(["Zebra", "Mango", "Apple"]);
	});

	it("sorts by date added newest first", () => {
		const out = sortRecipes(list, "date-new").map((r) => r.title);
		expect(out).toEqual(["Zebra", "Mango", "Apple"]);
	});

	it("sorts by date added oldest first", () => {
		const out = sortRecipes(list, "date-old").map((r) => r.title);
		expect(out).toEqual(["Apple", "Mango", "Zebra"]);
	});

	it("does not mutate the original list", () => {
		const before = list.map((r) => r.title);
		sortRecipes(list, "name-asc");
		expect(list.map((r) => r.title)).toEqual(before);
	});

	it("returns the list unchanged for an unknown sort", () => {
		expect(sortRecipes(list, "nope")).toBe(list);
	});
});
