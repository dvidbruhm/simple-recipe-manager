import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";

const SECRET = "test-secret";

const PNG_VALID = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4kWKEFTEMpAQAV7NBoa8Fc1IAAAAASUVORK5CYII=",
	"base64",
);

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(dir, "images"), { recursive: true });
	return dir;
}

async function setupApp() {
	process.env.APP_PASSWORD = "pw";
	process.env.SESSION_SECRET = SECRET;
	const dataDir = freshDataDir();
	process.env.DATA_DIR = dataDir;

	const db = new Database(join(dataDir, "recipes.db"));
	migrate(db);
	const recipes = new RecipeRepository(db);

	writeFileSync(join(dataDir, "images", "abc123.png"), PNG_VALID);
	recipes.insert({
		title: "Tiramisu",
		description: "Italian dessert",
		ingredients: ["mascarpone", "coffee", "eggs", "sugar"],
		steps: ["mix cheese and eggs", "dip biscuits in coffee", "layer and chill"],
		source_url: "https://marmiton.org/x",
		image_filename: "abc123.png",
		rating: 5,
		notes: "Best served cold",
	});

	db.close();

	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie };
}

describe("PDF export", () => {
	it("GET /export/formats/pdf returns a valid PDF", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/export/formats/pdf", {
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/pdf");
		expect(res.headers.get("Content-Disposition") ?? "").toContain("recipes-");
		expect(res.headers.get("Content-Disposition") ?? "").toContain(".pdf");
		const buf = await res.arrayBuffer();
		const bytes = new Uint8Array(buf);
		expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
		expect(buf.byteLength).toBeGreaterThan(500);
	});

	it("embeds the image and uses the A4 page size", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/export/formats/pdf", {
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("/Subtype /Image");
		expect(text).toContain("/BaseFont /Helvetica-Bold");
		expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
	});
});
