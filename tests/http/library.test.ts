import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";
import { TagRepository } from "@/tags/repository";
import { createTestUser, freshDataDir, setupEnv, userCookie } from "../helpers/auth";

async function setupApp() {
	const dataDir = freshDataDir();
	setupEnv(dataDir);
	const db = new Database(`${dataDir}/recipes.db`);
	migrate(db);
	const { userId } = createTestUser(db);
	const recipes = new RecipeRepository(db, userId);
	const tags = new TagRepository(db, userId);
	const id1 = recipes.insert({
		title: "Tiramisu",
		ingredients: ["flour", "egg"],
		steps: ["bake"],
	});
	const id2 = recipes.insert({
		title: "Bolognese",
		ingredients: ["pasta", "tomato"],
		steps: ["simmer"],
		source_url: "https://www.bbcgoodfood.com/recipes/spaghetti-bolognese",
	});
	tags.replaceForRecipe(id1, ["dessert", "italian"]);
	tags.replaceForRecipe(id2, ["italian", "dinner"]);
	db.close();
	const app = buildApp();
	const cookie = await userCookie(userId);
	return { app, cookie };
}

describe("library page", () => {
	it("GET /recipes with cookie returns 200 + all recipe titles", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).toContain("Bolognese");
	});

	it("GET /recipes?tag=dessert filters by tag", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?tag=dessert", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).not.toContain("Bolognese");
	});

	it("GET /recipes?tag=dessert&tag=dinner returns recipes matching any tag (OR)", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?tag=dessert&tag=dinner", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).toContain("Bolognese");
	});

	it("selected tags render checked checkboxes for active tags", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?tag=italian", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain('value="italian"');
	});

	it("shows a friendly empty state when there are no recipes", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		const db = new Database(`${dataDir}/recipes.db`);
		migrate(db);
		const { userId } = createTestUser(db);
		db.close();
		const app = buildApp();
		const cookie = await userCookie(userId);
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain("Your recipe book is empty");
		expect(body).toContain("New recipe");
	});

	it("POST /view sets the view cookie and redirects to the referer", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/view", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Referer: "/recipes",
				Cookie: `session=${cookie}`,
			},
			body: "view=list",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/recipes");
		expect(res.headers.get("Set-Cookie") ?? "").toContain("view=list");
	});

	it("GET /recipes with view=list renders the list layout", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", {
			headers: { Cookie: `session=${cookie}; view=list` },
		});
		const body = await res.text();
		expect(body).toContain("list-view");
		expect(body).toContain("list-row");
	});

	it("GET /recipes?q=flour finds recipe by ingredient", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?q=flour", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).not.toContain("Bolognese");
	});

	it("HTMX request returns only grid partial, no <html>", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?q=tira", {
			headers: { Cookie: `session=${cookie}`, "HX-Request": "true" },
		});
		const body = await res.text();
		expect(body).not.toContain("<html");
		expect(body).toContain("Tiramisu");
	});

	it("renders selection hooks (data-recipe-id + check) on each card", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain("data-recipe-id=");
		expect(body).toContain('class="check"');
	});

	it("renders the bulk action bar and hidden delete form", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain("data-bulk-select");
		expect(body).toContain("data-bulk-actionbar");
		expect(body).toContain('id="bulk-delete-form"');
		expect(body).toContain("data-bulk-delete");
		expect(body).toContain('hx-post="/recipes/bulk-delete"');
		expect(body).toContain("Cancel");
	});

	it("renders the search form with hx-sync to drop stale requests", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain('hx-sync="this:replace"');
	});

	it("renders the grid skeleton placeholders for loading", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain('id="grid-skeletons"');
		expect(body).toContain("skeleton-card");
	});

	it("renders a Load more button when there are more than 60 recipes", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		const db = new Database(`${dataDir}/recipes.db`);
		migrate(db);
		const { userId } = createTestUser(db);
		const recipes = new RecipeRepository(db, userId);
		for (let i = 0; i < 65; i++) {
			recipes.insert({ title: `Recipe ${String(i).padStart(3, "0")}` });
		}
		db.close();
		const app = buildApp();
		const cookie = await userCookie(userId);
		const res = await app.request("/recipes?sort=name-asc", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain("load-more-btn");
		expect(body).not.toContain("Recipe 060");
		const htmxRes = await app.request("/recipes?sort=name-asc&page=2", {
			headers: { Cookie: `session=${cookie}`, "HX-Request": "true" },
		});
		const htmxBody = await htmxRes.text();
		expect(htmxBody).toContain("Recipe 060");
	});

	it("does not render Load more when total recipes fit on one page", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		const db = new Database(`${dataDir}/recipes.db`);
		migrate(db);
		const { userId } = createTestUser(db);
		const recipes = new RecipeRepository(db, userId);
		recipes.insert({ title: "Only One" });
		db.close();
		const app = buildApp();
		const cookie = await userCookie(userId);
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).not.toContain("load-more-btn");
	});

	it("renders results count and updates via htmx", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain("results-count");
		expect(body).toMatch(/2 recipes/);
		const htmxRes = await app.request("/recipes?q=tiramisu", {
			headers: { Cookie: `session=${cookie}`, "HX-Request": "true" },
		});
		const htmxBody = await htmxRes.text();
		expect(htmxBody).toContain("1 recipe");
	});

	it("renders active-filter chips and Clear all when filtering", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?q=flour&tag=dessert", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain("filter-chip");
		expect(body).toContain("Clear all");
		expect(body).toContain("Search:");
		expect(body).toContain("flour");
		expect(body).toContain("dessert");
	});

	it("does not render active-filter chips when not filtering", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).not.toContain("Clear all");
	});

	it("sort button shows the current sort label", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?sort=name-asc", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain("sort-label");
		expect(body).toContain("Name (A");
	});

	it("back-link affordance is present on recipe view (covered elsewhere) and search uses flexible width", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain("search-form");
		expect(body).toContain("max-w-96");
	});
});
