const COOKIE_NAME = "session";

function base64url(buf: ArrayBuffer | Uint8Array): string {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, msg: string): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
}

export async function createSessionCookie(secret: string, ttlSec: number): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + ttlSec;
	const payload = `${exp}`;
	const sig = base64url(await hmac(secret, payload));
	return `${payload}.${sig}`;
}

export async function verifySessionCookie(cookie: string, secret: string): Promise<boolean> {
	const parts = cookie.split(".");
	if (parts.length !== 2) return false;
	const payload = parts[0];
	const sig = parts[1];
	if (payload === undefined || sig === undefined) return false;
	const expected = base64url(await hmac(secret, payload));
	if (expected.length !== sig.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) {
		diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
	}
	if (diff !== 0) return false;
	const exp = Number(payload);
	if (!Number.isFinite(exp)) return false;
	return exp > Math.floor(Date.now() / 1000);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
