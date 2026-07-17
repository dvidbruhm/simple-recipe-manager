import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";

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
	const id = recipes.insert({ title: "Tiramisu", ingredients: ["flour"] });
	db.close();
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie, id };
}

describe("undo toast on library", () => {
	it("GET /recipes?toast=...&undo_url=... renders the toast", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?toast=Deleted&undo_url=/recipes/1/restore", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain('class="toast"');
		expect(body).toContain("Deleted");
		expect(body).toContain("/recipes/1/restore");
		expect(body).toContain("Undo");
	});

	it("renders Undo as a POST form to the restore route, not a GET link", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?toast=Deleted&undo_url=/recipes/1/restore", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain('method="post"');
		expect(body).toContain('action="/recipes/1/restore"');
		expect(body).toContain('class="toast-undo"');
		expect(body).not.toContain('href="/recipes/1/restore"');
	});

	it("GET /recipes without toast params does NOT render the toast", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).not.toContain('class="toast"');
	});

	it("POST /recipes/:id/delete redirects with toast + undo_url query params", async () => {
		const { app, cookie, id } = await setupApp();
		const res = await app.request(`/recipes/${id}/delete`, {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);
		const loc = res.headers.get("location") ?? "";
		expect(loc).toContain("/recipes?toast=");
		expect(loc).toContain("undo_url=");
		expect(loc).toContain("restore");
	});

	it("HTMX request does not include toast in the partial response", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?toast=Deleted&undo_url=/recipes/1/restore", {
			headers: { Cookie: `session=${cookie}`, "HX-Request": "true" },
		});
		const body = await res.text();
		expect(body).not.toContain('class="toast"');
	});
});
