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
	const id1 = recipes.insert({ title: "Tiramisu", ingredients: ["flour"] });
	const id2 = recipes.insert({ title: "Bolognese", ingredients: ["pasta"] });
	const id3 = recipes.insert({ title: "Ratatouille", ingredients: ["aubergine"] });
	db.close();
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie, id1, id2, id3 };
}

function auth(cookie: string) {
	return { headers: { Cookie: `session=${cookie}` } };
}

function hx(cookie: string) {
	return { headers: { Cookie: `session=${cookie}`, "HX-Request": "true" } };
}

describe("bulk delete / restore", () => {
	it("POST /recipes/bulk-delete (HX) soft-deletes ids and returns grid + toast", async () => {
		const { app, cookie, id1, id2 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		fd.append("ids", String(id2));
		const res = await app.request("/recipes/bulk-delete", {
			method: "POST",
			body: fd,
			...hx(cookie),
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Ratatouille");
		expect(body).not.toContain("Tiramisu");
		expect(body).not.toContain("Bolognese");
		expect(body).toContain("Deleted 2 recipes");
		expect(body).toContain('id="toast-area"');
		expect(body).toContain('hx-post="/recipes/bulk-restore"');
		expect(body).toContain(`name="ids" value="${id1}"`);
		expect(body).toContain(`name="ids" value="${id2}"`);
	});

	it("POST /recipes/bulk-delete with no ids returns 400", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes/bulk-delete", {
			method: "POST",
			body: new FormData(),
			...auth(cookie),
		});
		expect(res.status).toBe(400);
	});

	it("POST /recipes/bulk-delete (non-HX) redirects to /recipes with a toast", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		const res = await app.request("/recipes/bulk-delete", {
			method: "POST",
			body: fd,
			...auth(cookie),
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location") ?? "").toContain("/recipes?toast=");
	});

	it("POST /recipes/bulk-restore (HX) restores ids and clears the toast", async () => {
		const { app, cookie, id1, id2 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		fd.append("ids", String(id2));
		await app.request("/recipes/bulk-delete", { method: "POST", body: fd, ...hx(cookie) });

		const rfd = new FormData();
		rfd.append("ids", String(id1));
		rfd.append("ids", String(id2));
		const res = await app.request("/recipes/bulk-restore", {
			method: "POST",
			body: rfd,
			...hx(cookie),
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).toContain("Bolognese");
		expect(body).toContain('id="toast-area"');
		expect(body).not.toContain("Deleted");
		expect(body).toContain("Ratatouille");
	});

	it("bulk-deleted recipes reappear in the normal library listing after restore", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		await app.request("/recipes/bulk-delete", { method: "POST", body: fd, ...auth(cookie) });
		let lib = await (await app.request("/recipes", auth(cookie))).text();
		expect(lib).not.toContain("Tiramisu");

		const rfd = new FormData();
		rfd.append("ids", String(id1));
		await app.request("/recipes/bulk-restore", { method: "POST", body: rfd, ...auth(cookie) });
		lib = await (await app.request("/recipes", auth(cookie))).text();
		expect(lib).toContain("Tiramisu");
	});
});
