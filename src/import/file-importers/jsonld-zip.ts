import JSZip from "jszip";
import type { PartialRecipe } from "@/import/extractor";
import type { FileImportAdapter } from "./adapter";
import { mapJsonLdToPartial } from "./json-ld";

export class JsonLdZipAdapter implements FileImportAdapter {
	matches(name: string, _mime: string): boolean {
		const lower = name.toLowerCase();
		return lower.endsWith(".zip") && (lower.includes("jsonld") || lower.includes("json-ld"));
	}

	async parse(buffer: Uint8Array, _opts: { tempDir: string }): Promise<PartialRecipe[]> {
		const zip = await JSZip.loadAsync(buffer);
		const recipes: PartialRecipe[] = [];
		const files = Object.values(zip.files);
		for (const file of files) {
			const lower = file.name.toLowerCase();
			if (file.dir) continue;
			if (
				lower.endsWith(".jsonld") ||
				(lower.endsWith(".json") && !lower.endsWith("manifest.json"))
			) {
				const text = await file.async("string");
				let data: unknown;
				try {
					data = JSON.parse(text);
				} catch {
					continue;
				}
				if (Array.isArray(data)) {
					for (const item of data) {
						if (item && typeof item === "object") {
							recipes.push(mapJsonLdToPartial(item as Record<string, unknown>));
						}
					}
				} else if (data && typeof data === "object") {
					recipes.push(mapJsonLdToPartial(data as Record<string, unknown>));
				}
			}
		}
		return recipes;
	}
}
