import type { PartialRecipe } from "@/import/extractor";

export interface FileImportAdapter {
	matches(name: string, mime: string): boolean;
	parse(buffer: Uint8Array, opts: { tempDir: string }): Promise<PartialRecipe[]>;
}
