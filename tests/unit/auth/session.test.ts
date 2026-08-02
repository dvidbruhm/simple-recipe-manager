import { createSessionCookie, verifySessionCookie } from "@/auth/session";

describe("session", () => {
	const secret = "test-secret";
	const userId = 42;

	it("creates a cookie and verifies it", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60, userId);
		expect(cookie).toBeTruthy();
		const verified = await verifySessionCookie(cookie, secret);
		expect(verified).not.toBeNull();
		expect(verified?.userId).toBe(userId);
	});

	it("rejects cookie signed with different secret", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60, userId);
		const verified = await verifySessionCookie(cookie, "different");
		expect(verified).toBeNull();
	});

	it("rejects tampered cookie", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60, userId);
		const tampered = `${cookie.slice(0, -2)}XX`;
		const verified = await verifySessionCookie(tampered, secret);
		expect(verified).toBeNull();
	});

	it("rejects tampered userId", async () => {
		const cookie = await createSessionCookie(secret, 60 * 60, userId);
		const parts = cookie.split(".");
		const exp = parts[0];
		const sig = parts[2];
		const tampered = `${exp}.999.${sig}`;
		const verified = await verifySessionCookie(tampered, secret);
		expect(verified).toBeNull();
	});

	it("rejects expired cookie", async () => {
		const cookie = await createSessionCookie(secret, -1, userId);
		const verified = await verifySessionCookie(cookie, secret);
		expect(verified).toBeNull();
	});
});
