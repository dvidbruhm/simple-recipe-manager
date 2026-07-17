import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { createSessionCookie } from "@/auth/session";
import { buildApp } from "@/server";

const SECRET = "test-secret";
const FIXTURES = join(process.cwd(), "tests", "fixtures");

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function stubFetch(fixtureFile: string | null): () => void {
	const original = globalThis.fetch;
	const html = fixtureFile ? readFileSync(join(FIXTURES, fixtureFile), "utf-8") : "";
	const stub = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
		const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (u.includes("marmiton.org")) {
			return new Response(html, {
				status: 200,
				headers: { "Content-Type": "text/html" },
			});
		}
		return new Response("", { status: 404 });
	};
	globalThis.fetch = stub as typeof globalThis.fetch;
	return () => {
		globalThis.fetch = original;
	};
}

interface Setup {
	app: Hono;
	cookie: string;
	restore: () => void;
}

async function setupApp(fixture: string | null): Promise<Setup> {
	process.env.APP_PASSWORD = "pw";
	process.env.SESSION_SECRET = SECRET;
	process.env.DATA_DIR = freshDataDir();
	const restore = stubFetch(fixture);
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie, restore };
}

const MARMITON_URL = "https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx";

function auth(cookie: string) {
	return { headers: { Cookie: `session=${cookie}` } };
}

describe("import routes", () => {
	let restoreFetch: (() => void) | null = null;
	afterEach(() => {
		if (restoreFetch) restoreFetch();
		restoreFetch = null;
	});

	it("GET /import renders URL form", async () => {
		const { app, cookie, restore } = await setupApp(null);
		restoreFetch = restore;
		const res = await app.request("/import", auth(cookie));
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('action="/recipes/import"');
		expect(body).toContain('name="url"');
	});

	it("POST /recipes/import with extractable URL creates a recipe and redirects to edit", async () => {
		const { app, cookie, restore } = await setupApp("marmiton.html");
		restoreFetch = restore;
		const res = await app.request("/recipes/import", {
			method: "POST",
			headers: { ...auth(cookie).headers, "Content-Type": "application/x-www-form-urlencoded" },
			body: `url=${encodeURIComponent(MARMITON_URL)}`,
		});
		expect(res.status).toBe(302);
		const loc = res.headers.get("Location") ?? "";
		expect(loc).toMatch(/^\/recipes\/\d+\/edit$/);

		const editRes = await app.request(loc, auth(cookie));
		const editBody = await editRes.text();
		expect(editBody).toContain("Tarte aux amaretti");
	});

	it("GET /import/shared?url=... runs extract and redirects to edit like the manual flow", async () => {
		const { app, cookie, restore } = await setupApp("marmiton.html");
		restoreFetch = restore;
		const res = await app.request(
			`/import/shared?url=${encodeURIComponent(MARMITON_URL)}`,
			auth(cookie),
		);
		expect(res.status).toBe(302);
		const loc = res.headers.get("Location") ?? "";
		expect(loc).toMatch(/^\/recipes\/\d+\/edit$/);

		const editRes = await app.request(loc, auth(cookie));
		expect(await editRes.text()).toContain("Tarte aux amaretti");
	});

	it("GET /import/shared without url returns 400", async () => {
		const { app, cookie, restore } = await setupApp(null);
		restoreFetch = restore;
		const res = await app.request("/import/shared", auth(cookie));
		expect(res.status).toBe(400);
	});

	it("POST /recipes/import when the fetcher is blocked goes to the new-recipe paste form without creating a recipe", async () => {
		const { app, cookie, restore } = await setupApp(null);
		restoreFetch = restore;
		const res = await app.request("/recipes/import", {
			method: "POST",
			headers: { ...auth(cookie).headers, "Content-Type": "application/x-www-form-urlencoded" },
			body: "url=https://blocked.example.com/recipe",
		});
		expect(res.status).toBe(302);
		const loc = res.headers.get("Location") ?? "";
		expect(loc).toMatch(/^\/recipes\/new\?import=paste_html/);
		expect(loc).toContain("url=");
		// no recipe was created
		const lib = await app.request("/recipes", auth(cookie));
		const body = await lib.text();
		expect(body).toContain("Your recipe book is empty");
	});

	it("POST /recipes/import/html with no existing recipe creates one from pasted HTML", async () => {
		const { app, cookie, restore } = await setupApp(null);
		restoreFetch = restore;

		const html = readFileSync(join(FIXTURES, "marmiton.html"), "utf-8");
		const res = await app.request("/recipes/import/html", {
			method: "POST",
			headers: { ...auth(cookie).headers, "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ url: MARMITON_URL, html }).toString(),
		});
		expect(res.status).toBe(302);
		const loc = res.headers.get("Location") ?? "";
		expect(loc).toMatch(/^\/recipes\/\d+\/edit$/);

		const after = await app.request(loc, auth(cookie));
		expect(await after.text()).toContain("Tarte aux amaretti");
	});

	it("POST /recipes/import/html updates an existing recipe when recipe_id is provided", async () => {
		const { app, cookie, restore } = await setupApp("marmiton.html");
		restoreFetch = restore;

		// create a real recipe via a successful import
		const importRes = await app.request("/recipes/import", {
			method: "POST",
			headers: { ...auth(cookie).headers, "Content-Type": "application/x-www-form-urlencoded" },
			body: `url=${encodeURIComponent(MARMITON_URL)}`,
		});
		const recipeId = (importRes.headers.get("Location") ?? "").match(/^\/recipes\/(\d+)\/edit/)?.[1] ?? "0";

		const html = readFileSync(join(FIXTURES, "marmiton.html"), "utf-8");
		const res = await app.request("/recipes/import/html", {
			method: "POST",
			headers: { ...auth(cookie).headers, "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ recipe_id: recipeId, html }).toString(),
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe(`/recipes/${recipeId}/edit`);

		const after = await app.request(`/recipes/${recipeId}/edit`, auth(cookie));
		expect(await after.text()).toContain("Tarte aux amaretti");
	});
});
