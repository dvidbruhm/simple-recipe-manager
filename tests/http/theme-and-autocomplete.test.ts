import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";
import { TagRepository } from "@/tags/repository";
import { createTestUser, freshDataDir, setupEnv, userCookie } from "../helpers/auth";

const PNG_1x1 = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
);

async function setupApp() {
	const dataDir = freshDataDir();
	setupEnv(dataDir);
	const db = new Database(`${dataDir}/recipes.db`);
	migrate(db);
	const { userId } = createTestUser(db);
	const recipes = new RecipeRepository(db, userId);
	const tags = new TagRepository(db, userId);
	const id1 = recipes.insert({ title: "Tiramisu", ingredients: ["mascarpone"], steps: ["layer"] });
	const id2 = recipes.insert({ title: "Bolognese", ingredients: ["pasta"], steps: ["simmer"] });
	tags.replaceForRecipe(id1, ["dessert", "italian"]);
	tags.replaceForRecipe(id2, ["italian", "dinner"]);
	db.close();
	mkdirSync(join(dataDir, "images"), { recursive: true });
	writeFileSync(join(dataDir, "images", "test.png"), PNG_1x1);
	const app = buildApp();
	const cookie = await userCookie(userId);
	return { app, cookie, dataDir, id1, id2 };
}

function auth(
	cookie: string,
	extra: Record<string, string> = {},
): { headers: Record<string, string> } {
	return { headers: { Cookie: `session=${cookie}`, ...extra } };
}

describe("theme toggle, tag autocomplete, and image serving", () => {
	describe("GET /tags/autocomplete", () => {
		it("returns matching tag names as JSON for a query prefix", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/tags/autocomplete?q=des", auth(cookie));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type") ?? "").toContain("application/json");
			expect(JSON.parse(await res.text())).toEqual(["dessert"]);
		});

		it("returns an empty JSON array when q is missing", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/tags/autocomplete", auth(cookie));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type") ?? "").toContain("application/json");
			expect(JSON.parse(await res.text())).toEqual([]);
		});

		it("round-trips tag names with HTML-special characters as JSON data", async () => {
			const dataDir = freshDataDir();
			setupEnv(dataDir);
			const db = new Database(`${dataDir}/recipes.db`);
			migrate(db);
			const { userId } = createTestUser(db);
			const recipes = new RecipeRepository(db, userId);
			const tags = new TagRepository(db, userId);
			const id = recipes.insert({ title: "X", ingredients: [], steps: [] });
			tags.replaceForRecipe(id, ["<b>bold</b>"]);
			db.close();
			const app = buildApp();
			const cookie = await userCookie(userId);
			const res = await app.request("/tags/autocomplete?q=%3Cb", auth(cookie));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type") ?? "").toContain("application/json");
			expect(JSON.parse(await res.text())).toEqual(["<b>bold</b>"]);
		});
	});

	describe("POST /theme", () => {
		it("sets theme + mode cookies and redirects to the Referer", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Referer: "/recipes",
					Cookie: `session=${cookie}`,
				},
				body: "theme=hearth&mode=dark",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe("/recipes");
			const setCookie = res.headers.get("Set-Cookie") ?? "";
			expect(setCookie).toMatch(/theme=hearth/);
			expect(setCookie).toMatch(/mode=dark/);
		});

		it("rejects an unknown theme value with 400", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${cookie}`,
				},
				body: "theme=neon&mode=dark",
			});
			expect(res.status).toBe(400);
		});

		it("rejects an invalid mode with 400", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${cookie}`,
				},
				body: "theme=aurora&mode=sepia",
			});
			expect(res.status).toBe(400);
		});

		it("requires auth (redirects to /login without a session)", async () => {
			const { app } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: "theme=aurora&mode=dark",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location") ?? "").toContain("/login");
		});
	});

	describe("GET /static/images/:filename", () => {
		it("serves a real uploaded image with the correct Content-Type", async () => {
			const { app } = await setupApp();
			const res = await app.request("/static/images/test.png");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("image/png");
			const buf = await res.arrayBuffer();
			expect(buf.byteLength).toBe(PNG_1x1.length);
		});

		it("returns 404 for a nonexistent image", async () => {
			const { app } = await setupApp();
			const res = await app.request("/static/images/does-not-exist-123.png");
			expect(res.status).toBe(404);
		});

		it("blocks path traversal attempts via the filename sanitizer", async () => {
			const { app } = await setupApp();
			const res = await app.request("/static/images/..%2F..%2Fetc%2Fpasswd");
			expect(res.status).toBe(404);
		});
	});

	describe("base layout theme wiring", () => {
		it("renders data-theme + data-mode on <html> and a theme-color meta", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request(
				"/settings",
				auth(cookie, { Cookie: `theme=aurora; mode=dark; session=${cookie}` }),
			);
			const body = await res.text();
			expect(body).toContain('data-theme="aurora"');
			expect(body).toContain('data-mode="dark"');
			expect(body).toContain('name="theme-color"');
		});

		it("no longer renders the header theme-toggle form", async () => {
			const { app } = await setupApp();
			const res = await app.request("/login");
			const body = await res.text();
			expect(body).not.toContain('class="btn theme-toggle"');
			expect(body).not.toContain('aria-label="Toggle theme"');
		});

		it("renders the active theme's font <link>", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request(
				"/settings",
				auth(cookie, { Cookie: `theme=hearth; mode=dark; session=${cookie}` }),
			);
			const body = await res.text();
			expect(body).toContain('rel="stylesheet" href="https://fonts.googleapis.com/css2');
		});
	});

	describe("Settings appearance gallery", () => {
		it("renders all 7 theme swatches and a light/dark control", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/settings", auth(cookie));
			const body = await res.text();
			for (const id of [
				"neutral",
				"aurora",
				"aurora-solstice",
				"inkwell",
				"hearth",
				"hearth-spice",
				"gourmet-noir",
			]) {
				expect(body).toContain(`data-theme-id="${id}"`);
			}
			expect(body).toContain('name="mode"');
			expect(body).toContain('value="dark"');
			expect(body).toContain('value="light"');
		});

		it("marks the active theme and disables light for themes without a light variant", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request(
				"/settings",
				auth(cookie, { Cookie: `theme=hearth; mode=dark; session=${cookie}` }),
			);
			const body = await res.text();
			expect(body).toContain('data-theme-id="hearth" aria-current="true"');
			expect(body).toContain("data-mode-light-disabled");
		});

		it("posts theme + mode to /theme from the gallery form", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${cookie}`,
				},
				body: "theme=inkwell&mode=dark",
			});
			expect(res.status).toBe(302);
		});
	});
});
