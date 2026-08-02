import type { Database } from "bun:sqlite";
import { hashPassword } from "./password";

export interface User {
	id: number;
	email: string;
	password_hash: string;
	password_salt: string;
	created_at: string;
}

export interface UserCredentials {
	email: string;
	password: string;
}

export class DuplicateEmailError extends Error {
	constructor(email: string) {
		super(`An account already exists for ${email}`);
		this.name = "DuplicateEmailError";
	}
}

function deserialize(row: Record<string, unknown>): User {
	return {
		id: row.id as number,
		email: row.email as string,
		password_hash: row.password_hash as string,
		password_salt: row.password_salt as string,
		created_at: row.created_at as string,
	};
}

export class UserRepository {
	constructor(private db: Database) {}

	create({ email, password }: UserCredentials): User {
		const normalized = email.trim().toLowerCase();
		const existing = this.findByEmail(normalized);
		if (existing) throw new DuplicateEmailError(normalized);
		const { hash, salt } = hashPassword(password);
		const result = this.db
			.query("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) RETURNING *")
			.get(normalized, hash, salt) as Record<string, unknown>;
		return deserialize(result);
	}

	findByEmail(email: string): User | null {
		const normalized = email.trim().toLowerCase();
		const row = this.db.query("SELECT * FROM users WHERE email = ?").get(normalized) as Record<
			string,
			unknown
		> | null;
		return row ? deserialize(row) : null;
	}

	getById(id: number): User | null {
		const row = this.db.query("SELECT * FROM users WHERE id = ?").get(id) as Record<
			string,
			unknown
		> | null;
		return row ? deserialize(row) : null;
	}

	updatePassword(userId: number, newPlain: string): void {
		const { hash, salt } = hashPassword(newPlain);
		this.db
			.query("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
			.run(hash, salt, userId);
	}
}
