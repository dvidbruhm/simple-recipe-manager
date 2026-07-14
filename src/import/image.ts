import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export async function downloadImage(dataDir: string, url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(30_000),
			redirect: "follow",
		});
		if (!res.ok) return null;
		const ct = res.headers.get("content-type") ?? "";
		if (!ALLOWED.has(ct)) return null;
		const buf = await res.arrayBuffer();
		if (buf.byteLength > 8_000_000) return null;
		const ext = EXT[ct];
		if (!ext) return null;
		const name = `${randomUUID()}.${ext}`;
		await writeFile(join(dataDir, "images", name), Buffer.from(buf));
		return name;
	} catch {
		return null;
	}
}
