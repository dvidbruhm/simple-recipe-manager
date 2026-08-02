import { Database } from "bun:sqlite";
import { hashPassword } from "@/auth/password";
import { migrate } from "@/db/migrate";
import type { DetectionResult } from "@/import/duplicate-detector";
import { detectDuplicates } from "@/import/duplicate-detector";
import type { PartialRecipe } from "@/import/extractor";
import { RecipeRepository } from "@/recipes/repository";

function setup() {
	const db = new Database(":memory:");
	migrate(db);
	const result = db
		.query("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) RETURNING id")
		.get("u@x.com", ...(Object.values(hashPassword("pw")) as [string, string])) as {
		id: number;
	};
	const userId = result.id;
	return { db, userId, recipes: new RecipeRepository(db, userId) };
}

describe("detectDuplicates", () => {
	it("returns 'new' when no existing recipe matches", () => {
		const { recipes, userId, db } = setup();
		recipes.insert({ title: "Existing", ingredients: ["x"] });
		const incoming: PartialRecipe[] = [{ title: "Brand New", ingredients: ["y"] }];
		const results = detectDuplicates(db, incoming, userId);
		expect(results).toEqual([{ status: "new" }]);
	});

	it("detects duplicate by source_url match and reports the existing id", () => {
		const { db, recipes, userId } = setup();
		const id = recipes.insert({ title: "Existing", source_url: "https://marmiton.org/x" });
		const incoming: PartialRecipe[] = [
			{ title: "Different Title", source_url: "https://marmiton.org/x" },
		];
		const results = detectDuplicates(db, incoming, userId);
		expect(results[0]?.status).toBe("duplicate");
		const r0 = results[0] as Extract<DetectionResult, { status: "duplicate" }>;
		expect(r0.existingId).toBe(id);
		expect(r0.reason).toContain("source_url");
	});

	it("detects duplicate by normalized title + matching first ingredient", () => {
		const { db, recipes, userId } = setup();
		recipes.insert({ title: "Tiramisu", ingredients: ["mascarpone", "coffee"] });
		const incoming: PartialRecipe[] = [{ title: "tiramisu", ingredients: ["Mascarpone"] }];
		const results = detectDuplicates(db, incoming, userId);
		expect(results[0]?.status).toBe("duplicate");
		const r0 = results[0] as Extract<DetectionResult, { status: "duplicate" }>;
		expect(r0.reason).toContain("title");
	});

	it("does NOT flag as duplicate when title matches but first ingredient differs", () => {
		const { db, recipes, userId } = setup();
		recipes.insert({ title: "Tiramisu", ingredients: ["mascarpone"] });
		const incoming: PartialRecipe[] = [{ title: "Tiramisu", ingredients: ["flour"] }];
		const results = detectDuplicates(db, incoming, userId);
		expect(results[0]).toEqual({ status: "new" });
	});

	it("matches title with leading/trailing punctuation differences", () => {
		const { db, recipes, userId } = setup();
		recipes.insert({ title: "Best Tiramisu!!!", ingredients: ["mascarpone"] });
		const incoming: PartialRecipe[] = [{ title: "best tiramisu", ingredients: ["Mascarpone"] }];
		const results = detectDuplicates(db, incoming, userId);
		expect(results[0]?.status).toBe("duplicate");
	});

	it("handles multiple incoming recipes, mixed new and duplicate", () => {
		const { db, recipes, userId } = setup();
		recipes.insert({ title: "A", source_url: "https://x.com/a" });
		const incoming: PartialRecipe[] = [
			{ title: "A", source_url: "https://x.com/a" },
			{ title: "B", ingredients: ["y"] },
		];
		const results = detectDuplicates(db, incoming, userId);
		expect(results[0]?.status).toBe("duplicate");
		expect(results[1]?.status).toBe("new");
	});

	it("ignores soft-deleted recipes when matching", () => {
		const { db, recipes, userId } = setup();
		const id = recipes.insert({ title: "Tiramisu", ingredients: ["mascarpone"] });
		recipes.softDelete(id);
		const incoming: PartialRecipe[] = [{ title: "Tiramisu", ingredients: ["mascarpone"] }];
		const results = detectDuplicates(db, incoming, userId);
		expect(results[0]?.status).toBe("new");
	});

	it("only matches against the current user's recipes (cross-user isolation)", () => {
		const { db, recipes, userId } = setup();
		recipes.insert({ title: "Tiramisu", ingredients: ["mascarpone"] });
		const other = db
			.query(
				"INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) RETURNING id",
			)
			.get("b@x.com", "h", "s") as { id: number };
		const incoming: PartialRecipe[] = [{ title: "Tiramisu", ingredients: ["mascarpone"] }];
		// Different user → should not see user A's tiramisu as a duplicate
		const results = detectDuplicates(db, incoming, other.id);
		expect(results[0]).toEqual({ status: "new" });
		// Same user → duplicate detected
		const sameUserResults = detectDuplicates(db, incoming, userId);
		expect(sameUserResults[0]?.status).toBe("duplicate");
	});
});
