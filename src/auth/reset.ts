import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_TTL_SECONDS = 60 * 60;

export interface IssuedToken {
	token: string;
	expiresAt: Date;
}

export interface VerifiedToken {
	userId: number;
	tokenId: number;
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function base64url(buf: Buffer): string {
	return buf.toString("base64url");
}

export class PasswordResetRepository {
	constructor(private db: Database) {}

	issue(userId: number): IssuedToken {
		const raw = randomBytes(TOKEN_BYTES);
		const token = base64url(raw);
		const tokenHash = hashToken(token);
		const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
		this.db
			.query("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
			.run(tokenHash, userId, expiresAt.toISOString());
		return { token, expiresAt };
	}

	verify(token: string): VerifiedToken | null {
		if (!token) return null;
		const tokenHash = hashToken(token);
		const row = this.db
			.query(
				`SELECT rowid AS rid, user_id, expires_at, used_at
				 FROM password_reset_tokens
				 WHERE token_hash = ?`,
			)
			.get(tokenHash) as {
			rid: number;
			user_id: number;
			expires_at: string;
			used_at: string | null;
		} | null;
		if (!row) return null;
		if (row.used_at !== null) return null;
		if (new Date(row.expires_at).getTime() <= Date.now()) return null;
		return { userId: row.user_id, tokenId: row.rid };
	}

	consume(token: string): void {
		const tokenHash = hashToken(token);
		const now = new Date().toISOString();
		this.db
			.query("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?")
			.run(now, tokenHash);
	}

	deleteAllForUser(userId: number): void {
		this.db.query("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
	}
}

export const PASSWORD_RESET_TTL_SECONDS = TOKEN_TTL_SECONDS;
