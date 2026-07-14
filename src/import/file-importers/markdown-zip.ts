import JSZip from "jszip";
import { parse as parseYaml } from "yaml";
import type { PartialRecipe } from "@/import/extractor";
import type { FileImportAdapter } from "./adapter";

interface MdFrontmatter {
	title?: string;
	source_url?: string;
	rating?: number;
	tags?: string | string[];
	created_at?: string;
	image?: string;
}

function splitSections(body: string): Record<string, string> {
	const sections: Record<string, string> = {};
	const lines = body.split("\n");
	let current: string | null = null;
	const buf: string[] = [];
	for (const line of lines) {
		const m = line.match(/^##\s+(.+?)\s*$/);
		const heading = m?.[1];
		if (heading !== undefined) {
			if (current !== null) sections[current] = buf.join("\n").trim();
			current = heading.toLowerCase().trim();
			buf.length = 0;
		} else if (current !== null) {
			buf.push(line);
		}
	}
	if (current !== null) sections[current] = buf.join("\n").trim();
	return sections;
}

function parseMarkdown(text: string): PartialRecipe | null {
	const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	const fmRaw = fmMatch?.[1];
	const body = fmMatch?.[2];
	if (!fmRaw || !body) return null;
	let fm: MdFrontmatter;
	try {
		fm = parseYaml(fmRaw) as MdFrontmatter;
	} catch {
		return null;
	}
	const sections = splitSections(body);

	const ingredients = (sections.ingredients ?? "")
		.split("\n")
		.map((l) => l.replace(/^[-*]\s+/, "").trim())
		.filter(Boolean);

	const steps = (sections.steps ?? "")
		.split("\n")
		.map((l) => l.replace(/^\d+\.\s+/, "").trim())
		.filter(Boolean);

	const tags = Array.isArray(fm.tags)
		? fm.tags
		: typeof fm.tags === "string"
			? fm.tags
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: [];

	return {
		title: fm.title ?? "",
		source_url: fm.source_url ?? "",
		rating: typeof fm.rating === "number" ? fm.rating : 0,
		tags,
		image: fm.image ?? null,
		ingredients,
		steps,
		notes: sections.notes ?? "",
	};
}

export class MarkdownZipAdapter implements FileImportAdapter {
	matches(name: string, _mime: string): boolean {
		const lower = name.toLowerCase();
		return lower.endsWith(".zip") && lower.includes(".md");
	}

	async parse(buffer: Uint8Array, _opts: { tempDir: string }): Promise<PartialRecipe[]> {
		const zip = await JSZip.loadAsync(buffer);
		const recipes: PartialRecipe[] = [];
		const mdFiles = Object.values(zip.files).filter(
			(f) => !f.dir && f.name.toLowerCase().endsWith(".md"),
		);
		for (const file of mdFiles) {
			const text = await file.async("string");
			const recipe = parseMarkdown(text);
			if (recipe) recipes.push(recipe);
		}
		return recipes;
	}
}
