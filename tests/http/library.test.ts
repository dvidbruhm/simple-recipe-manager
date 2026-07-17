import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";
import { TagRepository } from "@/tags/repository";

const SECRET = "test-secret";

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

async function setupApp() {
	process.env.APP_PASSWORD = "pw";
	process.env.SESSION_SECRET = SECRET;
	const dataDir = freshDataDir();
	process.env.DATA_DIR = dataDir;
	const db = new Database(`${dataDir}/recipes.db`);
	migrate(db);
	const recipes = new RecipeRepository(db);
	const tags = new TagRepository(db);
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
	const cookie = await createSessionCookie(SECRET, 3600);
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
		process.env.APP_PASSWORD = "pw";
		process.env.SESSION_SECRET = SECRET;
		process.env.DATA_DIR = freshDataDir();
		const app = buildApp();
		const cookie = await createSessionCookie(SECRET, 3600);
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
});
