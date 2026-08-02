import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { App } from "@/app";
import { createSessionCookie } from "@/auth/session";
import { UserRepository } from "@/auth/users";
import { migrate } from "@/db/migrate";
import { buildApp } from "@/server";

export const TEST_SECRET = "test-secret";

export function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function setupEnv(dataDir: string): void {
	process.env.SESSION_SECRET = TEST_SECRET;
	process.env.APP_BASE_URL = "http://localhost:3000";
	process.env.SMTP_HOST = "smtp.example.com";
	process.env.SMTP_FROM = "test@example.com";
	process.env.SMTP_PORT = "587";
	process.env.DATA_DIR = dataDir;
}

export function createTestUser(
	db: Database,
	email = "tester@example.com",
): {
	userId: number;
} {
	const users = new UserRepository(db);
	const user = users.create({ email, password: "password123" });
	return { userId: user.id };
}

export async function userCookie(userId: number): Promise<string> {
	return await createSessionCookie(TEST_SECRET, 3600, userId);
}

export interface TestSetup {
	app: App;
	cookie: string;
	userId: number;
	dataDir: string;
}

/** Convenience: boot a fresh app with one user and no recipes. */
export async function setupAuthedApp(): Promise<TestSetup> {
	const dataDir = freshDataDir();
	setupEnv(dataDir);
	const db = new Database(`${dataDir}/recipes.db`);
	migrate(db);
	const { userId } = createTestUser(db);
	db.close();
	const app = buildApp();
	const cookie = await userCookie(userId);
	return { app, cookie, userId, dataDir };
}

/** Boot a fresh app with no authenticated user — for testing public routes. */
export function setupBareApp(): App {
	const dataDir = freshDataDir();
	setupEnv(dataDir);
	return buildApp();
}

export function authHeader(cookie: string): { headers: { Cookie: string } } {
	return { headers: { Cookie: `session=${cookie}` } };
}
