import { tryReadability } from "./extractors/readability";
import { trySchemaExtract } from "./extractors/recipe-scrapers";

export interface PartialRecipe {
	title?: string;
	description?: string;
	ingredients?: string[];
	steps?: string[];
	source_url?: string;
	image?: string | null;
	notes?: string;
}

export type ImportOutcome =
	| { kind: "structured"; recipe: PartialRecipe }
	| { kind: "readability"; recipe: PartialRecipe; rawText: string }
	| { kind: "unsupported"; reason: string };

export async function extractRecipe(url: string, html: string): Promise<ImportOutcome> {
	const structured = await trySchemaExtract(url, html);
	if (structured) {
		return {
			kind: "structured",
			recipe: { ...structured, source_url: url },
		};
	}
	const readable = tryReadability(html);
	if (readable && readable.text.length > 100) {
		return {
			kind: "readability",
			recipe: {
				title: readable.title,
				description: readable.excerpt,
				steps: [readable.text],
				source_url: url,
				image: readable.image,
			},
			rawText: readable.text,
		};
	}
	return { kind: "unsupported", reason: "no schema and unreadable body" };
}
