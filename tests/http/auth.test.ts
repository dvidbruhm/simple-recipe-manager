import { Database } from "bun:sqlite";
import { join } from "node:path";
import { CapturingMailer } from "@/auth/email";
import { PasswordResetRepository } from "@/auth/reset";
import { UserRepository } from "@/auth/users";
import { migrate } from "@/db/migrate";
import { buildApp } from "@/server";
import { freshDataDir, setupBareApp, setupEnv, userCookie } from "../helpers/auth";

describe("auth routes", () => {
	it("GET /recipes without cookie redirects to /login", async () => {
		const app = setupBareApp();
		const res = await app.request("/recipes");
		expect(res.status).toBe(302);
		expect(res.headers.get("Location") ?? "").toContain("/login");
	});

	it("GET /login renders the email + password form", async () => {
		const app = setupBareApp();
		const res = await app.request("/login");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('name="email"');
		expect(body).toContain('name="password"');
		expect(body).toContain('href="/register"');
		expect(body).toContain('href="/forgot"');
	});

	it("GET /register renders the registration form", async () => {
		const app = setupBareApp();
		const res = await app.request("/register");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('name="email"');
		expect(body).toContain('name="password"');
		expect(body).toContain("At least 8 characters");
	});

	it("POST /register creates an account, sets cookie, redirects to /recipes", async () => {
		const app = setupBareApp();
		const res = await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/recipes");
		const setCookie = res.headers.get("Set-Cookie") ?? "";
		expect(setCookie).toContain("session=");
		expect(setCookie).toContain("HttpOnly");
	});

	it("POST /register with a short password returns 400 + an error message", async () => {
		const app = setupBareApp();
		const res = await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=short",
		});
		expect(res.status).toBe(400);
		const body = await res.text();
		expect(body).toContain("at least 8 characters");
	});

	it("POST /register with a duplicate email returns 409 + an error", async () => {
		const app = setupBareApp();
		await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		const res = await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		expect(res.status).toBe(409);
		const body = await res.text();
		expect(body).toContain("already exists");
	});

	it("POST /register with an invalid email returns 400", async () => {
		const app = setupBareApp();
		const res = await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=not-an-email&password=password123",
		});
		expect(res.status).toBe(400);
	});

	it("POST /login with correct credentials sets cookie and redirects to /recipes", async () => {
		const app = setupBareApp();
		await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		const res = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/recipes");
		expect(res.headers.get("Set-Cookie") ?? "").toContain("session=");
	});

	it("POST /login with wrong password returns 401 with a generic error", async () => {
		const app = setupBareApp();
		await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		const res = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=wrongpassword",
		});
		expect(res.status).toBe(401);
		const body = await res.text();
		expect(body).toContain("Invalid email or password");
	});

	it("POST /login with unknown email returns the same 401 (no enumeration)", async () => {
		const app = setupBareApp();
		const res = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=nobody@example.com&password=whatever12",
		});
		expect(res.status).toBe(401);
		const body = await res.text();
		expect(body).toContain("Invalid email or password");
	});

	it("GET /recipes with a valid cookie returns 200", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		const db = new Database(join(dataDir, "recipes.db"));
		migrate(db);
		const users = new UserRepository(db);
		const user = users.create({ email: "alice@example.com", password: "password123" });
		db.close();
		const app = buildApp();
		const cookie = await userCookie(user.id);
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		expect(res.status).toBe(200);
	});

	it("POST /logout clears the session cookie and redirects to /login", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		const db = new Database(join(dataDir, "recipes.db"));
		migrate(db);
		const users = new UserRepository(db);
		const user = users.create({ email: "alice@example.com", password: "password123" });
		db.close();
		const app = buildApp();
		const cookie = await userCookie(user.id);
		const res = await app.request("/logout", {
			method: "POST",
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/login");
		expect(res.headers.get("Set-Cookie") ?? "").toContain("session=");
		expect(res.headers.get("Set-Cookie") ?? "").toContain("Max-Age=0");
	});

	it("POST /forgot always redirects to /forgot/sent regardless of email existence", async () => {
		const app = setupBareApp();
		const res1 = await app.request("/forgot", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=does-not-exist@example.com",
		});
		expect(res1.status).toBe(302);
		expect(res1.headers.get("Location")).toBe("/forgot/sent");
		const res2 = await app.request("/forgot", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=not-an-email",
		});
		expect(res2.status).toBe(302);
		expect(res2.headers.get("Location")).toBe("/forgot/sent");
	});

	it("GET /forgot/sent renders the generic success page", async () => {
		const app = setupBareApp();
		const res = await app.request("/forgot/sent");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Check your email");
	});

	it("GET /reset?token=invalid renders an error and no password field", async () => {
		const app = setupBareApp();
		const res = await app.request("/reset?token=invalid");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("reset link is invalid");
		expect(body).not.toContain('name="password"');
	});

	it("full reset flow: register → forgot → reset → login with new password", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		// Boot app once, then drive via the DB to capture the mailer out-of-band
		const app = buildApp();
		await app.request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});

		// Issue a reset token directly via the repo, since we don't wire a capturing
		// mailer here — the token can be minted from the DB the same way.
		const db = new Database(join(dataDir, "recipes.db"));
		const users = new UserRepository(db);
		const resets = new PasswordResetRepository(db);
		const user = users.findByEmail("alice@example.com");
		expect(user).not.toBeNull();
		if (!user) throw new Error("user missing");
		const issued = resets.issue(user.id);
		db.close();

		const resetUrl = `/reset?token=${encodeURIComponent(issued.token)}`;
		const resetPage = await app.request(resetUrl);
		const resetBody = await resetPage.text();
		expect(resetBody).toContain('name="password"');

		const newPass = "newpassword456";
		const resetRes = await app.request("/reset", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: `token=${encodeURIComponent(issued.token)}&password=${newPass}`,
		});
		expect(resetRes.status).toBe(302);
		expect(resetRes.headers.get("Location")).toBe("/login");

		// Old password no longer works
		const oldLoginRes = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "email=alice@example.com&password=password123",
		});
		expect(oldLoginRes.status).toBe(401);

		// New password works
		const newLoginRes = await app.request("/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: `email=alice@example.com&password=${newPass}`,
		});
		expect(newLoginRes.status).toBe(302);
		expect(newLoginRes.headers.get("Location")).toBe("/recipes");

		// Token cannot be reused
		const reuseRes = await app.request("/reset", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: `token=${encodeURIComponent(issued.token)}&password=anotherpass`,
		});
		const reuseBody = await reuseRes.text();
		expect(reuseBody).toContain("already used");
	});

	it("isolates libraries across users", async () => {
		const dataDir = freshDataDir();
		setupEnv(dataDir);
		const db = new Database(join(dataDir, "recipes.db"));
		migrate(db);
		const users = new UserRepository(db);
		const alice = users.create({ email: "alice@example.com", password: "password123" });
		const bob = users.create({ email: "bob@example.com", password: "password456" });
		// Direct insert: alice owns a recipe, bob owns none
		db.query("INSERT INTO recipes (owner_id, title, ingredients, steps) VALUES (?, ?, ?, ?)").run(
			alice.id,
			"Alice-only-recipe",
			"[]",
			"[]",
		);
		db.close();
		const app = buildApp();

		const aliceCookie = await userCookie(alice.id);
		const bobCookie = await userCookie(bob.id);

		const aliceLib = await (
			await app.request("/recipes", { headers: { Cookie: `session=${aliceCookie}` } })
		).text();
		const bobLib = await (
			await app.request("/recipes", { headers: { Cookie: `session=${bobCookie}` } })
		).text();

		expect(aliceLib).toContain("Alice-only-recipe");
		expect(bobLib).not.toContain("Alice-only-recipe");
		expect(bobLib).toContain("Your recipe book is empty");
	});

	it("rate limit: rapid login attempts eventually return 429", async () => {
		const app = setupBareApp();
		// Exhaust the per-IP bucket (capacity 10) — each attempt is one cost
		let lastStatus = 200;
		for (let i = 0; i < 15; i++) {
			const res = await app.request("/login", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: "email=x@example.com&password=wrongpassword",
			});
			lastStatus = res.status;
			if (res.status === 429) break;
		}
		expect(lastStatus).toBe(429);
	});

	void CapturingMailer;
});
