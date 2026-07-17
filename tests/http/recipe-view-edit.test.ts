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
		description: "A layered coffee dessert",
		ingredients: ["flour", "egg"],
		steps: ["bake", "cool"],
		notes: "keep chilled",
		source_url: "https://www.bbcgoodfood.com/recipes/tiramisu",
		rating: 3,
	});
	const id2 = recipes.insert({
		title: "Bolognese",
		ingredients: ["pasta", "tomato"],
		steps: ["simmer"],
	});
	tags.replaceForRecipe(id1, ["dessert", "italian"]);
	tags.replaceForRecipe(id2, ["italian", "dinner"]);
	db.close();
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie, id1, id2 };
}

function auth(cookie: string) {
	return { headers: { Cookie: `session=${cookie}` } };
}

describe("recipe view & edit pages", () => {
	it("GET /recipes/:id returns 200 with title + ingredients present", async () => {
		const { app, cookie, id1 } = await setupApp();
		const res = await app.request(`/recipes/${id1}`, auth(cookie));
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).toContain("flour");
		expect(body).toContain("egg");
		expect(body).toContain("bake");
	});

	it("GET /recipes/:id for non-existent id returns 404", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes/9999", auth(cookie));
		expect(res.status).toBe(404);
	});

	it("GET /recipes/:id/edit returns 200 with all fields pre-filled", async () => {
		const { app, cookie, id1 } = await setupApp();
		const res = await app.request(`/recipes/${id1}/edit`, auth(cookie));
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('name="title"');
		expect(body).toContain('value="Tiramisu"');
		expect(body).toContain("flour");
		expect(body).toContain("egg");
		expect(body).toContain("bake");
		expect(body).toContain("keep chilled");
		expect(body).toContain('data-chip="dessert"');
		expect(body).toContain('data-chip="italian"');
		expect(body).toContain('name="tags" value="dessert"');
		expect(body).toContain('name="tags" value="italian"');
		expect(body).toContain('name="image"');
		expect(body).toContain('name="rating"');
	});

	it("POST /recipes/:id with valid form redirects to /recipes/:id and updates the row", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.set("title", "Updated Pancakes");
		fd.set("description", "Fluffy and golden");
		fd.set("ingredients", "flour\nmilk\negg");
		fd.set("steps", "mix the batter\ncook on skillet");
		fd.set("rating", "4");
		fd.set("tags", "");
		fd.set("source_url", "https://example.com/pancakes");
		fd.set("notes", "best served warm");

		const res = await app.request(`/recipes/${id1}`, {
			method: "POST",
			body: fd,
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`/recipes/${id1}`);

		const view = await app.request(`/recipes/${id1}`, auth(cookie));
		const body = await view.text();
		expect(body).toContain("Updated Pancakes");
		expect(body).not.toContain("Tiramisu");
		expect(body).toContain("Fluffy and golden");
		expect(body).toContain("flour");
		expect(body).toContain("milk");
		expect(body).toContain("mix the batter");
		expect(body).toContain("cook on skillet");
		expect(body).toContain("best served warm");
		expect(body).toContain("https://example.com/pancakes");
		expect(body).toContain('data-rating="4"');
		expect(body).not.toContain("dessert");
		expect(body).not.toContain("italian");
	});

	it("POST /recipes/:id with empty title returns 400", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.set("title", "   ");
		fd.set("ingredients", "x");
		fd.set("steps", "y");
		fd.set("rating", "0");
		fd.set("tags", "");

		const res = await app.request(`/recipes/${id1}`, {
			method: "POST",
			body: fd,
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(400);
	});

	it("POST /recipes/:id updates tags and view reflects them", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.set("title", "Tiramisu");
		fd.set("ingredients", "mascarpone");
		fd.set("steps", "layer");
		fd.set("rating", "0");
		fd.append("tags", "spicy");
		fd.append("tags", "quick");

		const res = await app.request(`/recipes/${id1}`, {
			method: "POST",
			body: fd,
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);

		const view = await app.request(`/recipes/${id1}`, auth(cookie));
		const body = await view.text();
		expect(body).toContain("spicy");
		expect(body).toContain("quick");
		expect(body).not.toContain("dessert");
		expect(body).not.toContain("italian");
	});

	it("POST /recipes/:id/delete soft-deletes + redirects with toast/undo, recipe leaves library", async () => {
		const { app, cookie, id1 } = await setupApp();
		const res = await app.request(`/recipes/${id1}/delete`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location.includes("/recipes?toast=")).toBe(true);
		expect(location.includes("undo_url=")).toBe(true);
		expect(location.includes("restore")).toBe(true);

		const lib = await app.request("/recipes", auth(cookie));
		const body = await lib.text();
		expect(body).not.toContain("Tiramisu");
		expect(body).toContain("Bolognese");
	});

	it("POST /recipes/:id/restore un-deletes + redirects to view, recipe returns to library", async () => {
		const { app, cookie, id1 } = await setupApp();
		await app.request(`/recipes/${id1}/delete`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});

		const res = await app.request(`/recipes/${id1}/restore`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`/recipes/${id1}`);

		const view = await app.request(`/recipes/${id1}`, auth(cookie));
		expect(view.status).toBe(200);

		const lib = await app.request("/recipes", auth(cookie));
		const body = await lib.text();
		expect(body).toContain("Tiramisu");
	});

	it("POST /recipes/:id/rating updates the rating and returns the rating partial", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.set("rating", "5");
		const res = await app.request(`/recipes/${id1}/rating`, {
			method: "POST",
			body: fd,
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(200);
		const out = await res.text();
		expect(out).toContain('data-rating="5"');
	});

	it("GET /recipes/new renders a blank form without persisting a recipe", async () => {
		const { app, cookie } = await setupApp();
		const before = (await app.request("/recipes", auth(cookie))).status;
		expect(before).toBe(200);
		const res = await app.request("/recipes/new", auth(cookie));
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("New Recipe");
		expect(body).toContain('action="/recipes"');
		expect(body).toContain('href="/recipes"');
		// visiting the new form must not create a recipe
		const lib = await app.request("/recipes", auth(cookie));
		const libBody = await lib.text();
		const matches = libBody.match(/href="\/recipes\/\d+"/g) ?? [];
		expect(matches.length).toBe(2);
	});

	it("POST /recipes creates a recipe and redirects to its view", async () => {
		const { app, cookie } = await setupApp();
		const fd = new FormData();
		fd.set("title", "Ratatouille");
		fd.set("ingredients", "aubergine\ncike");
		fd.set("steps", "chop\nsimmer");
		fd.set("rating", "4");
		fd.set("tags", "");
		const res = await app.request("/recipes", {
			method: "POST",
			body: fd,
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);
		const loc = res.headers.get("location") ?? "";
		expect(loc).toMatch(/^\/recipes\/\d+$/);
		const view = await app.request(loc, auth(cookie));
		const body = await view.text();
		expect(body).toContain("Ratatouille");
	});

	it("POST /recipes/:id/favorite toggles the favorite flag and returns the heart button", async () => {
		const { app, cookie, id1 } = await setupApp();
		const res = await app.request(`/recipes/${id1}/favorite`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(200);
		const out = await res.text();
		expect(out).toContain("is-fav");
		expect(out).toContain("♥");
		// toggle back
		const res2 = await app.request(`/recipes/${id1}/favorite`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		const out2 = await res2.text();
		expect(out2).toContain("♡");
		expect(out2).not.toContain("is-fav");
	});

	it("GET /recipes?tag=favorites lists only favorited recipes", async () => {
		const { app, cookie, id1, id2 } = await setupApp();
		// favorite id1 only
		await app.request(`/recipes/${id1}/favorite`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		const res = await app.request("/recipes?tag=favorites", auth(cookie));
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).not.toContain("Bolognese");
	});
});
