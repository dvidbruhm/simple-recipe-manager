import { setupBareApp } from "../helpers/auth";

describe("PWA endpoints", () => {
	async function setupApp() {
		return { app: setupBareApp() };
	}
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
		expect(body).toMatch(/recipe-manager-v\d+/);
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

	it("GET /manifest.webmanifest does NOT lock orientation to portrait", async () => {
		const { app } = await setupApp();
		const res = await app.request("/manifest.webmanifest");
		const body = await res.text();
		expect(body).not.toContain('"orientation": "portrait"');
	});

	it("GET /manifest.webmanifest includes description, shortcuts, and lang", async () => {
		const { app } = await setupApp();
		const res = await app.request("/manifest.webmanifest");
		const body = await res.text();
		expect(body).toContain('"description":');
		expect(body).toContain('"lang": "en"');
		expect(body).toContain('"shortcuts":');
		expect(body).toContain("/recipes/new");
		expect(body).toContain("/import");
	});

	it("GET /sw.js includes a branded offline page with favicon", async () => {
		const { app } = await setupApp();
		const res = await app.request("/sw.js");
		const body = await res.text();
		expect(body).toContain("/static/favicon.svg");
		expect(body).toContain("You're offline");
		expect(body).toContain("Try again");
	});

	it("GET /sw.js posts a skip-waiting message handler", async () => {
		const { app } = await setupApp();
		const res = await app.request("/sw.js");
		const body = await res.text();
		expect(body).toContain("skip-waiting");
	});
});
