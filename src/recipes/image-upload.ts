import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ALLOWED_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
const MAX_SIZE = 8 * 1024 * 1024;

export async function saveUploadedImage(dataDir: string, file: File): Promise<string | null> {
	const ext = ALLOWED_MIME[file.type];
	if (!ext) return null;
	if (file.size === 0 || file.size > MAX_SIZE) return null;
	const filename = `${crypto.randomUUID()}.${ext}`;
	const dir = join(dataDir, "images");
	await mkdir(dir, { recursive: true });
	const buf = await file.arrayBuffer();
	await writeFile(join(dir, filename), Buffer.from(buf));
	return filename;
}

export async function removeImage(dataDir: string, filename: string): Promise<void> {
	await unlink(join(dataDir, "images", filename)).catch(() => undefined);
}
