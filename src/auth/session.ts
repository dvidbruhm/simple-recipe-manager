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

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export async function createSessionCookie(
	secret: string,
	ttlSec: number,
	userId: number,
): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + ttlSec;
	const payload = `${exp}.${userId}`;
	const sig = base64url(await hmac(secret, payload));
	return `${payload}.${sig}`;
}

export interface VerifiedSession {
	userId: number;
	exp: number;
}

export async function verifySessionCookie(
	cookie: string,
	secret: string,
): Promise<VerifiedSession | null> {
	const parts = cookie.split(".");
	if (parts.length !== 3) return null;
	const expStr = parts[0];
	const userIdStr = parts[1];
	const sig = parts[2];
	if (expStr === undefined || userIdStr === undefined || sig === undefined) return null;
	const payload = `${expStr}.${userIdStr}`;
	const expected = base64url(await hmac(secret, payload));
	if (!(await constantTimeEqual(expected, sig))) return null;
	const exp = Number(expStr);
	const userId = Number(userIdStr);
	if (!Number.isFinite(exp) || !Number.isFinite(userId)) return null;
	if (exp <= Math.floor(Date.now() / 1000)) return null;
	return { userId, exp };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
