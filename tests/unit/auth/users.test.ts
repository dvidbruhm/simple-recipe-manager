import { Database } from "bun:sqlite";
import { hashPassword } from "@/auth/password";
import { DuplicateEmailError, UserRepository } from "@/auth/users";
import { migrate } from "@/db/migrate";

function setup() {
	const db = new Database(":memory:");
	migrate(db);
	return { db, users: new UserRepository(db) };
}

describe("UserRepository", () => {
	it("create returns the user with an id", () => {
		const { users } = setup();
		const u = users.create({ email: "Alice@Example.COM", password: "password123" });
		expect(u.id).toBeGreaterThan(0);
		expect(u.email).toBe("alice@example.com");
		expect(u.password_hash).toBeTruthy();
		expect(u.password_salt).toBeTruthy();
		expect(u.password_hash).not.toBe("password123");
	});

	it("create throws DuplicateEmailError on conflict", () => {
		const { users } = setup();
		users.create({ email: "alice@example.com", password: "password123" });
		expect(() => users.create({ email: "ALICE@example.com", password: "password456" })).toThrow(
			DuplicateEmailError,
		);
	});

	it("findByEmail is case-insensitive", () => {
		const { users } = setup();
		users.create({ email: "alice@example.com", password: "password123" });
		expect(users.findByEmail("ALICE@EXAMPLE.com")).not.toBeNull();
		expect(users.findByEmail("alice@example.com")).not.toBeNull();
	});

	it("findByEmail is whitespace-tolerant", () => {
		const { users } = setup();
		users.create({ email: "alice@example.com", password: "password123" });
		expect(users.findByEmail("  alice@example.com  ")).not.toBeNull();
	});

	it("findByEmail returns null for unknown email", () => {
		const { users } = setup();
		expect(users.findByEmail("nobody@example.com")).toBeNull();
	});

	it("getById returns the user", () => {
		const { users } = setup();
		const u = users.create({ email: "alice@example.com", password: "password123" });
		expect(users.getById(u.id)?.email).toBe("alice@example.com");
	});

	it("getById returns null for unknown id", () => {
		const { users } = setup();
		expect(users.getById(9999)).toBeNull();
	});

	it("updatePassword changes the hash and salt", () => {
		const { users } = setup();
		const u = users.create({ email: "alice@example.com", password: "password123" });
		const originalHash = u.password_hash;
		const originalSalt = u.password_salt;
		users.updatePassword(u.id, "newpassword456");
		const updated = users.getById(u.id);
		expect(updated?.password_hash).not.toBe(originalHash);
		expect(updated?.password_salt).not.toBe(originalSalt);
	});

	void hashPassword;
});
