import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "@/server";

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe("auth", () => {
	function setup() {
		process.env.APP_PASSWORD = "pw";
		process.env.PORT = "0";
		const dataDir = freshDataDir();
		process.env.DATA_DIR = dataDir;
		return buildApp();
	}

	it("GET /recipes without cookie redirects to /login", async () => {
		const app = setup();
		const res = await app.request("/recipes");
		expect(res.status).toBe(302);
		expect(res.headers.get("Location") ?? "").toContain("/login");
	});

	it("POST /login with correct password sets cookie and redirects to /recipes", async () => {
		const app = setup();
		const res = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "password=pw",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/recipes");
		const setCookie = res.headers.get("Set-Cookie") ?? "";
		expect(setCookie).toContain("session=");
		expect(setCookie).toContain("HttpOnly");
	});

	it("POST /login with wrong password returns 401", async () => {
		const app = setup();
		const res = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "password=wrong",
		});
		expect(res.status).toBe(401);
	});

	it("GET /recipes with valid cookie returns 200", async () => {
		const app = setup();
		const loginRes = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "password=pw",
		});
		const setCookieHeader = loginRes.headers.get("Set-Cookie") ?? "";
		const cookiePair = setCookieHeader.split(";")[0] ?? "";
		const res = await app.request("/recipes", { headers: { Cookie: cookiePair } });
		expect(res.status).toBe(200);
	});
});
