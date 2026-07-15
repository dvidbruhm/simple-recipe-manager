import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "@/server";

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe("static files", () => {
	function setup() {
		process.env.APP_PASSWORD = "pw";
		const dataDir = freshDataDir();
		process.env.DATA_DIR = dataDir;
		return buildApp();
	}

	it("GET /static/app.css returns CSS content", async () => {
		const app = setup();
		const res = await app.request("/static/app.css");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(100);
	});

	it("GET /static/htmx.min.js returns JS content", async () => {
		const app = setup();
		const res = await app.request("/static/htmx.min.js");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(1000);
	});

	it("GET /manifest.webmanifest returns JSON manifest", async () => {
		const app = setup();
		const res = await app.request("/manifest.webmanifest");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Recipe Manager");
		expect(body).toContain('"name"');
	});

	it("GET /sw.js returns the placeholder service worker", async () => {
		const app = setup();
		const res = await app.request("/sw.js");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("install");
	});

	it("GET /static/icons/192.png returns a PNG image", async () => {
		const app = setup();
		const res = await app.request("/static/icons/192.png");
		expect(res.status).toBe(200);
	});

	it("GET /static/tags-input.js returns the chips controller JS", async () => {
		const app = setup();
		const res = await app.request("/static/tags-input.js");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(100);
		expect(body).toContain("TagsInput");
	});

	it("GET /static/missing.txt does not 500", async () => {
		const app = setup();
		const res = await app.request("/static/does-not-exist.txt");
		expect(res.status).toBeLessThan(500);
	});
});
