import { createSessionCookie, verifySessionCookie } from "@/auth/session";

describe("session", () => {
	const secret = "test-secret";
	it("creates a cookie and verifies it", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60);
		expect(cookie).toBeTruthy();
		const valid = await verifySessionCookie(cookie, secret);
		expect(valid).toBe(true);
	});

	it("rejects cookie signed with different secret", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60);
		const valid = await verifySessionCookie(cookie, "different");
		expect(valid).toBe(false);
	});

	it("rejects tampered cookie", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60);
		const tampered = `${cookie.slice(0, -2)}XX`;
		const valid = await verifySessionCookie(tampered, secret);
		expect(valid).toBe(false);
	});

	it("rejects expired cookie", async () => {
		const cookie = await createSessionCookie(secret, -1);
		const valid = await verifySessionCookie(cookie, secret);
		expect(valid).toBe(false);
	});
});
