import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";
import { TagRepository } from "@/tags/repository";

const SECRET = "test-secret";
const PNG_1x1 = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
);

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
	const id1 = recipes.insert({ title: "Tiramisu", ingredients: ["mascarpone"], steps: ["layer"] });
	const id2 = recipes.insert({ title: "Bolognese", ingredients: ["pasta"], steps: ["simmer"] });
	tags.replaceForRecipe(id1, ["dessert", "italian"]);
	tags.replaceForRecipe(id2, ["italian", "dinner"]);
	db.close();
	mkdirSync(join(dataDir, "images"), { recursive: true });
	writeFileSync(join(dataDir, "images", "test.png"), PNG_1x1);
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
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
		it("returns matching tag chips for a query prefix", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/tags/autocomplete?q=des", auth(cookie));
			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain('<li class="chip"');
			expect(body.toLowerCase()).toContain("dessert");
			expect(body.toLowerCase()).not.toContain("italian");
			expect(body).toContain('data-name="dessert"');
		});

		it("returns an empty body when q is missing", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/tags/autocomplete", auth(cookie));
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("");
		});

		it("escapes HTML-unsafe characters in tag names", async () => {
			process.env.APP_PASSWORD = "pw";
			process.env.SESSION_SECRET = SECRET;
			const dataDir = freshDataDir();
			process.env.DATA_DIR = dataDir;
			const db = new Database(`${dataDir}/recipes.db`);
			migrate(db);
			const recipes = new RecipeRepository(db);
			const tags = new TagRepository(db);
			const id = recipes.insert({ title: "X", ingredients: [], steps: [] });
			tags.replaceForRecipe(id, ["<b>bold</b>"]);
			db.close();
			const app = buildApp();
			const cookie = await createSessionCookie(SECRET, 3600);
			const res = await app.request("/tags/autocomplete?q=%3Cb", auth(cookie));
			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain("&lt;b&gt;bold&lt;/b&gt;");
			expect(body).not.toContain("<b>bold</b>");
		});
	});

	describe("POST /theme", () => {
		it("sets the theme cookie and redirects to the Referer", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Referer: "/recipes",
					Cookie: `session=${cookie}`,
				},
				body: "theme=dark",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe("/recipes");
			expect(res.headers.get("Set-Cookie") ?? "").toContain("theme=dark");
		});

		it("rejects an unknown theme value with 400", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${cookie}`,
				},
				body: "theme=neon",
			});
			expect(res.status).toBe(400);
		});

		it("requires auth (redirects to /login without a session)", async () => {
			const { app } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: "theme=dark",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location") ?? "").toContain("/login");
		});
	});

	describe("header theme cycle button", () => {
		it("renders the cycle form targeting the next theme (auto -> light)", async () => {
			const { app } = await setupApp();
			const res = await app.request("/login");
			const body = await res.text();
			expect(body).toContain('action="/theme"');
			expect(body).toContain('name="theme"');
			expect(body).toContain('value="light"');
			expect(body).toContain("☀");
		});

		it("advances to dark with moon icon when current theme is light", async () => {
			const { app } = await setupApp();
			const res = await app.request("/login", { headers: { Cookie: "theme=light" } });
			const body = await res.text();
			expect(body).toContain('value="dark"');
			expect(body).toContain("🌙");
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
});
