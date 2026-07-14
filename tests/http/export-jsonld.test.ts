import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";
import { TagRepository } from "@/tags/repository";

const SECRET = "test-secret";

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
	const tags = new TagRepository(db);

	writeFileSync(join(dataDir, "images", "abc123.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

	const id1 = recipes.insert({
		title: "Tiramisu",
		description: "Italian dessert",
		ingredients: ["mascarpone", "coffee"],
		steps: ["mix", "layer"],
		source_url: "https://marmiton.org/x",
		image_filename: "abc123.png",
		rating: 5,
		notes: "Best cold",
	});
	tags.replaceForRecipe(id1, ["dessert", "italian"]);

	recipes.insert({
		title: "Plain soup",
		ingredients: ["water"],
		steps: ["boil"],
		rating: 0,
	});

	db.close();

	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie };
}

function zipEntryNames(bytes: Uint8Array): string[] {
	const names: string[] = [];
	for (let i = 0; i + 30 <= bytes.length; ) {
		if (
			bytes[i] === 0x50 &&
			bytes[i + 1] === 0x4b &&
			bytes[i + 2] === 0x03 &&
			bytes[i + 3] === 0x04
		) {
			const nameLen = (bytes[i + 26] ?? 0) | ((bytes[i + 27] ?? 0) << 8);
			const extraLen = (bytes[i + 28] ?? 0) | ((bytes[i + 29] ?? 0) << 8);
			const compSize =
				(bytes[i + 18] ?? 0) |
				((bytes[i + 19] ?? 0) << 8) |
				((bytes[i + 20] ?? 0) << 16) |
				((bytes[i + 21] ?? 0) << 24);
			let name = "";
			for (let j = 0; j < nameLen; j++) name += String.fromCharCode(bytes[i + 30 + j] ?? 0);
			names.push(name);
			i += 30 + nameLen + extraLen + compSize;
		} else {
			i += 1;
		}
	}
	return names;
}

describe("JSON-LD zip export", () => {
	it("GET /export/formats/json-ld-zip returns a zip of .jsonld files", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/export/formats/json-ld-zip", {
			headers: { Cookie: `session=${cookie}` },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/zip");
		expect(res.headers.get("Content-Disposition") ?? "").toContain(".jsonld.zip");

		const buf = await res.arrayBuffer();
		const bytes = new Uint8Array(buf);
		expect(bytes[0]).toBe(0x50);
		expect(bytes[1]).toBe(0x4b);
		expect(buf.byteLength).toBeGreaterThan(100);

		const names = zipEntryNames(bytes);
		expect(names).toContain("manifest.json");
		const jsonldEntries = names.filter((n) => n.endsWith(".jsonld"));
		expect(jsonldEntries.length).toBe(2);
		expect(names).toContain("001-tiramisu.jsonld");
		expect(names).toContain("002-plain-soup.jsonld");
		expect(names).toContain("images/abc123.png");
	});
});
