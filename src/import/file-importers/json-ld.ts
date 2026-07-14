import { parseHTML } from "linkedom";
import type { PartialRecipe } from "@/import/extractor";
import type { FileImportAdapter } from "./adapter";

function stripHtml(html: string): string {
	if (!html) return "";
	try {
		const { document } = parseHTML(`<div>${html}</div>`);
		return (document.querySelector("div")?.textContent ?? "").trim();
	} catch {
		return html.replace(/<[^>]+>/g, "").trim();
	}
}

function extractImageUrl(image: unknown): string | null {
	if (!image) return null;
	if (typeof image === "string") return image;
	if (Array.isArray(image)) {
		const first = image[0];
		if (typeof first === "string") return first;
		if (first && typeof first === "object" && "url" in first) {
			return String((first as { url: unknown }).url ?? "");
		}
		return null;
	}
	if (typeof image === "object" && image !== null && "url" in image) {
		return String((image as { url: unknown }).url ?? "");
	}
	return null;
}

export function mapJsonLdToPartial(obj: Record<string, unknown>): PartialRecipe {
	const name = typeof obj.name === "string" ? stripHtml(obj.name) : "";
	const description = typeof obj.description === "string" ? stripHtml(obj.description) : "";

	let ingredients: string[] = [];
	if (Array.isArray(obj.recipeIngredient)) {
		ingredients = obj.recipeIngredient
			.filter((x): x is string => typeof x === "string")
			.map((s) => stripHtml(s))
			.filter(Boolean);
	}

	let steps: string[] = [];
	if (Array.isArray(obj.recipeInstructions)) {
		steps = obj.recipeInstructions
			.map((item) => {
				if (typeof item === "string") return stripHtml(item);
				if (item && typeof item === "object" && "text" in item) {
					const t = (item as { text: unknown }).text;
					if (typeof t === "string") return stripHtml(t);
				}
				return "";
			})
			.filter(Boolean);
	}

	const atId = obj["@id"];
	const source_url = typeof atId === "string" && atId.startsWith("http") ? atId : "";

	const image = extractImageUrl(obj.image);

	const keywords = typeof obj.keywords === "string" ? obj.keywords : "";
	const tags = keywords
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const ar = obj.aggregateRating;
	const rawRating =
		ar && typeof ar === "object" && "ratingValue" in ar
			? Number((ar as { ratingValue: unknown }).ratingValue)
			: 0;
	const rating = Number.isFinite(rawRating) ? Math.max(0, Math.min(5, Math.round(rawRating))) : 0;

	const notesVal = obj["x-recipe-manager-notes"];
	const notes = typeof notesVal === "string" ? notesVal : "";

	return {
		title: name,
		description,
		ingredients,
		steps,
		source_url,
		image,
		notes,
		tags,
		rating,
	};
}

export class JsonLdAdapter implements FileImportAdapter {
	matches(name: string, _mime: string): boolean {
		const lower = name.toLowerCase();
		return lower.endsWith(".json") || lower.endsWith(".jsonld");
	}

	async parse(buffer: Uint8Array, _opts: { tempDir: string }): Promise<PartialRecipe[]> {
		const text = new TextDecoder().decode(buffer);
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			throw new Error("Invalid JSON");
		}
		if (Array.isArray(data)) {
			return data
				.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
				.map(mapJsonLdToPartial);
		}
		if (data !== null && typeof data === "object") {
			return [mapJsonLdToPartial(data as Record<string, unknown>)];
		}
		return [];
	}
}
