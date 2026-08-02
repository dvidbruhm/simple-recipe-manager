import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
const N = 1 << 15;
const R = 8;
const P = 1;
const MAXMEM = 128 * N * R + 1024 * 1024;

export interface PasswordHash {
	hash: string;
	salt: string;
}

export function hashPassword(plain: string): PasswordHash {
	const salt = randomBytes(16);
	const hash = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
	return {
		hash: hash.toString("base64"),
		salt: salt.toString("base64"),
	};
}

export function verifyPassword(
	plain: string,
	storedHashB64: string,
	storedSaltB64: string,
): boolean {
	const storedHash = Buffer.from(storedHashB64, "base64");
	if (storedHash.length !== KEYLEN) return false;
	const salt = Buffer.from(storedSaltB64, "base64");
	const candidate = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
	if (candidate.length !== storedHash.length) return false;
	return timingSafeEqual(candidate, storedHash);
}
