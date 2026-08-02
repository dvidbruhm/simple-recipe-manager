import { hashPassword, verifyPassword } from "@/auth/password";

describe("password hashing", () => {
	it("hash is deterministic given the same salt", () => {
		const a = hashPassword("hunter2");
		const b = verifyPassword("hunter2", a.hash, a.salt);
		expect(b).toBe(true);
	});

	it("salt is unique per call (hash differs for same password)", () => {
		const a = hashPassword("hunter2");
		const c = hashPassword("hunter2");
		expect(a.hash).not.toBe(c.hash);
		expect(a.salt).not.toBe(c.salt);
	});

	it("verify rejects wrong password", () => {
		const a = hashPassword("hunter2");
		expect(verifyPassword("wrong", a.hash, a.salt)).toBe(false);
	});

	it("verify rejects empty password", () => {
		const a = hashPassword("hunter2");
		expect(verifyPassword("", a.hash, a.salt)).toBe(false);
	});

	it("verify accepts long passwords", () => {
		const long = "a".repeat(1024);
		const a = hashPassword(long);
		expect(verifyPassword(long, a.hash, a.salt)).toBe(true);
	});

	it("verify rejects when stored hash has wrong length", () => {
		const a = hashPassword("hunter2");
		expect(verifyPassword("hunter2", "shortbase64=", a.salt)).toBe(false);
	});
});
