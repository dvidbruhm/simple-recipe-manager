import type { FileImportAdapter } from "./adapter";
import { JsonLdAdapter } from "./json-ld";
import { JsonLdZipAdapter } from "./jsonld-zip";
import { MarkdownZipAdapter } from "./markdown-zip";

const adapters: FileImportAdapter[] = [
	new JsonLdAdapter(),
	new JsonLdZipAdapter(),
	new MarkdownZipAdapter(),
];

export function pickAdapter(name: string, mime: string): FileImportAdapter | null {
	for (const adapter of adapters) {
		if (adapter.matches(name, mime)) return adapter;
	}
	return null;
}

export type { FileImportAdapter } from "./adapter";
