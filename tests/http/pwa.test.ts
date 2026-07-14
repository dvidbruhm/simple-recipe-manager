import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
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
	process.env.DATA_DIR = freshDataDir();
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie };
}

describe("PWA endpoints", () => {
	it("GET /manifest.webmanifest contains share_target", async () => {
		const { app } = await setupApp();
		const res = await app.request("/manifest.webmanifest");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("share_target");
		expect(body).toContain('"action": "/shared-target"');
		expect(body).toContain('"method": "POST"');
		expect(body).toContain('"url": "url"');
	});

	it("GET /sw.js contains the share-target intercept", async () => {
		const { app } = await setupApp();
		const res = await app.request("/sw.js");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("/shared-target");
		expect(body).toContain("Response.redirect");
		expect(body).toContain("/import/shared");
	});

	it("GET /sw.js contains the cache-version constant", async () => {
		const { app } = await setupApp();
		const res = await app.request("/sw.js");
		const body = await res.text();
		expect(body).toContain("recipe-manager-v1");
	});

	it("GET /sw.js installs + activates handlers", async () => {
		const { app } = await setupApp();
		const res = await app.request("/sw.js");
		const body = await res.text();
		expect(body).toContain('"install"');
		expect(body).toContain('"activate"');
		expect(body).toContain('"fetch"');
	});

	it("GET /manifest.webmanifest contains icons", async () => {
		const { app } = await setupApp();
		const res = await app.request("/manifest.webmanifest");
		const body = await res.text();
		expect(body).toContain("/static/icons/192.png");
		expect(body).toContain("/static/icons/512.png");
		expect(body).toContain('purpose": "maskable');
	});
});
