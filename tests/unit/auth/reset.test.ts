import { Database } from "bun:sqlite";
import { hashPassword } from "@/auth/password";
import { PasswordResetRepository } from "@/auth/reset";
import { migrate } from "@/db/migrate";

function setup() {
	const db = new Database(":memory:");
	migrate(db);
	const result = db
		.query("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) RETURNING id")
		.get("u@x.com", ...(Object.values(hashPassword("pw")) as [string, string])) as {
		id: number;
	};
	const userId = result.id;
	return { db, userId, resets: new PasswordResetRepository(db) };
}

describe("PasswordResetRepository", () => {
	it("issue returns a token and verify accepts it", () => {
		const { userId, resets } = setup();
		const issued = resets.issue(userId);
		expect(issued.token.length).toBeGreaterThan(30);
		const verified = resets.verify(issued.token);
		expect(verified).not.toBeNull();
		expect(verified?.userId).toBe(userId);
	});

	it("verify rejects an unknown token", () => {
		const { resets } = setup();
		expect(resets.verify("nonexistent-token")).toBeNull();
	});

	it("verify rejects an empty token", () => {
		const { resets } = setup();
		expect(resets.verify("")).toBeNull();
	});

	it("verify rejects an expired token", () => {
		const { db, userId, resets } = setup();
		const issued = resets.issue(userId);
		// Force expiry
		db.query("UPDATE password_reset_tokens SET expires_at = ?").run("2000-01-01T00:00:00Z");
		expect(resets.verify(issued.token)).toBeNull();
	});

	it("consume marks a token used; verify then rejects it", () => {
		const { userId, resets } = setup();
		const issued = resets.issue(userId);
		resets.consume(issued.token);
		expect(resets.verify(issued.token)).toBeNull();
	});

	it("deleteAllForUser removes every token for that user", () => {
		const { userId, resets } = setup();
		const a = resets.issue(userId);
		const b = resets.issue(userId);
		resets.deleteAllForUser(userId);
		expect(resets.verify(a.token)).toBeNull();
		expect(resets.verify(b.token)).toBeNull();
	});

	it("token is single-use even after deleteAllForUser is called", () => {
		const { userId, resets } = setup();
		const issued = resets.issue(userId);
		resets.consume(issued.token);
		resets.deleteAllForUser(userId);
		expect(resets.verify(issued.token)).toBeNull();
	});
});
