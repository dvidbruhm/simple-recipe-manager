import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";
import { TagRepository } from "@/tags/repository";

const SECRET = "test-secret";
const FIXTURES = join(process.cwd(), "tests", "fixtures");

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(dir, "images"), { recursive: true });
	return dir;
}

interface SetupResult {
	app: Hono;
	cookie: string;
	restore: () => void;
}

async function setupApp(seedRecipe = false): Promise<SetupResult> {
	process.env.APP_PASSWORD = "pw";
	process.env.SESSION_SECRET = SECRET;
	const dataDir = freshDataDir();
	process.env.DATA_DIR = dataDir;

	if (seedRecipe) {
		const db = new Database(join(dataDir, "recipes.db"));
		migrate(db);
		const recipes = new RecipeRepository(db);
		const tags = new TagRepository(db);
		const id = recipes.insert({
			title: "Sample Cake",
			ingredients: ["2 cups flour"],
		});
		tags.replaceForRecipe(id, []);
		db.close();
	}

	const originalFetch = globalThis.fetch;
	globalThis.fetch = (() => {
		return Promise.resolve(new Response("", { status: 404 }));
	}) as unknown as typeof globalThis.fetch;

	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return {
		app,
		cookie,
		restore: () => {
			globalThis.fetch = originalFetch;
		},
	};
}

describe("settings page", () => {
	let restore: (() => void) | null = null;
	afterEach(() => {
		if (restore) restore();
		restore = null;
	});

	it("GET /settings renders export buttons + import form", async () => {
		const ctx = await setupApp();
		restore = ctx.restore;
		const res = await ctx.app.request("/settings", {
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("/export/formats/pdf");
		expect(body).toContain("/export/formats/md-zip");
		expect(body).toContain("/export/formats/json-ld-zip");
		expect(body).toContain('action="/settings/import/preview"');
		expect(body).toContain('name="file"');
	});

	it("POST /settings/import/preview with a JSON-LD file shows the parsed recipes", async () => {
		const ctx = await setupApp();
		restore = ctx.restore;
		const fileContent = readFileSync(join(FIXTURES, "sample.jsonld"));
		const formData = new FormData();
		formData.append("file", new File([fileContent], "sample.jsonld", { type: "application/json" }));

		const res = await ctx.app.request("/settings/import/preview", {
			method: "POST",
			body: formData,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Sample Cake");
		expect(body).toContain("1 new");
		expect(body).toContain("0 duplicates");
	});

	it("POST /settings/import/preview with no file returns 400", async () => {
		const ctx = await setupApp();
		restore = ctx.restore;
		const formData = new FormData();
		const res = await ctx.app.request("/settings/import/preview", {
			method: "POST",
			body: formData,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(res.status).toBe(400);
	});

	it("POST /settings/import/preview with unsupported file type returns 400", async () => {
		const ctx = await setupApp();
		restore = ctx.restore;
		const formData = new FormData();
		formData.append("file", new File(["hello"], "recipes.csv", { type: "text/csv" }));
		const res = await ctx.app.request("/settings/import/preview", {
			method: "POST",
			body: formData,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(res.status).toBe(400);
	});

	it("POST /settings/import/preview detects duplicate when matching recipe exists", async () => {
		const ctx = await setupApp(true);
		restore = ctx.restore;
		const fileContent = readFileSync(join(FIXTURES, "sample.jsonld"));
		const formData = new FormData();
		formData.append("file", new File([fileContent], "sample.jsonld", { type: "application/json" }));

		const res = await ctx.app.request("/settings/import/preview", {
			method: "POST",
			body: formData,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Sample Cake");
		expect(body).toContain("0 new");
		expect(body).toContain("1 duplicate");
		expect(body).toContain("Skip");
		expect(body).toContain('value="replace_');
	});

	it("POST /settings/import/commit creates new recipes and redirects to library", async () => {
		const ctx = await setupApp();
		restore = ctx.restore;
		const fileContent = readFileSync(join(FIXTURES, "sample.jsonld"));
		const formData = new FormData();
		formData.append("file", new File([fileContent], "sample.jsonld", { type: "application/json" }));
		const previewRes = await ctx.app.request("/settings/import/preview", {
			method: "POST",
			body: formData,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		const previewBody = await previewRes.text();
		const sessionMatch = previewBody.match(/name="session" value="([^"]+)"/);
		const sessionId = sessionMatch?.[1] ?? "";
		expect(sessionId).toBeTruthy();

		const commitForm = new FormData();
		commitForm.append("session", sessionId);
		const commitRes = await ctx.app.request("/settings/import/commit", {
			method: "POST",
			body: commitForm,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(commitRes.status).toBe(302);
		const loc = commitRes.headers.get("Location") ?? "";
		expect(loc).toContain("/recipes");
		expect(loc).toContain("toast=");

		const libRes = await ctx.app.request("/recipes", {
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		const libBody = await libRes.text();
		expect(libBody).toContain("Sample Cake");
	});

	it("POST /settings/import/commit with expired/invalid session returns 400", async () => {
		const ctx = await setupApp();
		restore = ctx.restore;
		const formData = new FormData();
		formData.append("session", "totally-fake-uuid");
		const res = await ctx.app.request("/settings/import/commit", {
			method: "POST",
			body: formData,
			headers: { Cookie: `session=${ctx.cookie}` },
		});
		expect(res.status).toBe(400);
	});
});
