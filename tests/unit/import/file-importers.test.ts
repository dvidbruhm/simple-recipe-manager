import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { pickAdapter } from "@/import/file-importers";
import type { FileImportAdapter } from "@/import/file-importers/adapter";
import { JsonLdAdapter } from "@/import/file-importers/json-ld";
import { JsonLdZipAdapter } from "@/import/file-importers/jsonld-zip";
import { MarkdownZipAdapter } from "@/import/file-importers/markdown-zip";
import { normalizeTitle } from "@/import/file-importers/normalize";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("JsonLdAdapter", () => {
	const adapter = new JsonLdAdapter();

	it("parses a single-object .jsonld file", async () => {
		const buf = readFileSync(join(FIXTURES, "sample.jsonld"));
		const recipes = await adapter.parse(new Uint8Array(buf), { tempDir: "/tmp" });
		expect(recipes.length).toBe(1);
		const r = recipes[0];
		expect(r?.title).toBe("Sample Cake");
		expect(r?.description).toBe("A test recipe");
		expect(r?.ingredients).toEqual(["2 cups flour", "1 cup sugar", "3 eggs"]);
		expect(r?.ingredients?.length).toBe(3);
		expect(r?.steps).toEqual([
			"Mix dry ingredients",
			"Add eggs and mix well",
			"Bake at 350F for 30 minutes",
		]);
		expect(r?.steps?.length).toBe(3);
		expect(r?.tags).toEqual(["dessert", "baking", "cake"]);
		expect(r?.rating).toBe(4);
		expect(r?.notes).toBe("Family favorite");
		expect(r?.source_url).toBe("");
		expect(r?.image).toBe(null);
	});

	it("parses an array .jsonld file", async () => {
		const buf = readFileSync(join(FIXTURES, "sample-array.jsonld"));
		const recipes = await adapter.parse(new Uint8Array(buf), { tempDir: "/tmp" });
		expect(recipes.length).toBe(2);
		expect(recipes[0]?.title).toBe("Cake A");
		expect(recipes[1]?.title).toBe("Cake B");
		expect(recipes[1]?.rating).toBe(5);
		expect(recipes[1]?.notes).toBe("Loved it");
	});

	it("parses RecipeSage-style export with image as array of ImageObject", async () => {
		const buf = readFileSync(join(FIXTURES, "sample-recipesage.jsonld"));
		const recipes = await adapter.parse(new Uint8Array(buf), { tempDir: "/tmp" });
		expect(recipes.length).toBe(1);
		expect(recipes[0]?.title).toBe("RecipeSage Test");
		expect(recipes[0]?.image).toBe("https://example.com/rice.jpg");
		expect(recipes[0]?.tags).toEqual(["side", "rice"]);
		expect(recipes[0]?.ingredients).toEqual(["1 cup rice"]);
	});

	it("strips HTML from ingredients and steps", async () => {
		const htmlRecipe = {
			"@context": "https://schema.org",
			"@type": "Recipe",
			name: "<b>HTML Title</b>",
			description: "<i>HTML desc</i>",
			recipeIngredient: ["<strong>1 cup</strong> flour"],
			recipeInstructions: [{ "@type": "HowToStep", text: "<em>Mix</em> well" }],
		};
		const buf = new TextEncoder().encode(JSON.stringify(htmlRecipe));
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes[0]?.title).toBe("HTML Title");
		expect(recipes[0]?.description).toBe("HTML desc");
		expect(recipes[0]?.ingredients?.[0]).toBe("1 cup flour");
		expect(recipes[0]?.steps?.[0]).toBe("Mix well");
	});

	it("clamps rating into 0-5 range and rounds", async () => {
		const buf = new TextEncoder().encode(
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "Recipe",
				name: "R",
				aggregateRating: { "@type": "AggregateRating", ratingValue: 9.4 },
			}),
		);
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes[0]?.rating).toBe(5);
	});

	it("sets rating 0 when aggregateRating missing or non-numeric", async () => {
		const buf = new TextEncoder().encode(
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "Recipe",
				name: "No Rating",
				aggregateRating: { "@type": "AggregateRating", ratingValue: "n/a" },
			}),
		);
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes[0]?.rating).toBe(0);
	});

	it("extracts source_url from @id when it is an http(s) URL", async () => {
		const buf = new TextEncoder().encode(
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "Recipe",
				name: "X",
				"@id": "https://example.com/recipe/x",
			}),
		);
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes[0]?.source_url).toBe("https://example.com/recipe/x");
	});

	it("throws on invalid JSON", async () => {
		const buf = new TextEncoder().encode("not valid json {{{");
		await expect(adapter.parse(buf, { tempDir: "/tmp" })).rejects.toThrow(/JSON/);
	});

	it("returns empty array for non-object JSON (e.g. a number)", async () => {
		const buf = new TextEncoder().encode("42");
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes).toEqual([]);
	});

	it("matches .json and .jsonld extensions only", () => {
		expect(adapter.matches("recipes.jsonld", "application/json")).toBe(true);
		expect(adapter.matches("recipes.json", "application/json")).toBe(true);
		expect(adapter.matches("recipes.zip", "application/zip")).toBe(false);
		expect(adapter.matches("recipes.csv", "text/csv")).toBe(false);
	});
});

describe("JsonLdZipAdapter", () => {
	it("extracts recipes from a zip of .jsonld files", async () => {
		const zip = new JSZip();
		zip.file(
			"01-cake.jsonld",
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "Recipe",
				name: "Cake",
				recipeIngredient: ["flour"],
				recipeInstructions: [{ "@type": "HowToStep", text: "bake" }],
			}),
		);
		const buf = await zip.generateAsync({ type: "uint8array" });
		const adapter = new JsonLdZipAdapter();
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes.length).toBe(1);
		expect(recipes[0]?.title).toBe("Cake");
	});

	it("skips manifest.json and invalid JSON entries", async () => {
		const zip = new JSZip();
		zip.file("manifest.json", JSON.stringify({ format: "json-ld", files: ["01-cake.jsonld"] }));
		zip.file("01-cake.jsonld", JSON.stringify({ "@type": "Recipe", name: "Cake" }));
		zip.file("02-broken.jsonld", "{not valid");
		const buf = await zip.generateAsync({ type: "uint8array" });
		const adapter = new JsonLdZipAdapter();
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes.length).toBe(1);
		expect(recipes[0]?.title).toBe("Cake");
	});

	it("matches .zip whose name mentions jsonld", () => {
		const adapter = new JsonLdZipAdapter();
		expect(adapter.matches("recipes.jsonld.zip", "application/zip")).toBe(true);
		expect(adapter.matches("recipes.json-ld.zip", "application/zip")).toBe(true);
		expect(adapter.matches("recipes.md.zip", "application/zip")).toBe(false);
	});
});

describe("MarkdownZipAdapter", () => {
	it("extracts recipes from a zip of .md files with frontmatter", async () => {
		const md = `---
title: "Bread"
source_url: "https://example.com"
rating: 4
tags: [baking, easy]
image: "images/bread.jpg"
---

# Bread

A simple loaf.

## Ingredients
- flour
- water
- yeast

## Steps
1. Mix
2. Knead
3. Bake

## Notes
Let it cool before slicing.
`;
		const zip = new JSZip();
		zip.file("01-bread.md", md);
		const buf = await zip.generateAsync({ type: "uint8array" });
		const adapter = new MarkdownZipAdapter();
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes.length).toBe(1);
		expect(recipes[0]?.title).toBe("Bread");
		expect(recipes[0]?.source_url).toBe("https://example.com");
		expect(recipes[0]?.ingredients).toEqual(["flour", "water", "yeast"]);
		expect(recipes[0]?.steps).toEqual(["Mix", "Knead", "Bake"]);
		expect(recipes[0]?.tags).toEqual(["baking", "easy"]);
		expect(recipes[0]?.rating).toBe(4);
		expect(recipes[0]?.image).toBe("images/bread.jpg");
		expect(recipes[0]?.notes).toBe("Let it cool before slicing.");
	});

	it("ignores the description paragraph between title and first section", async () => {
		const md = `---
title: "NoSections"
---

# NoSections

This is a description with no section headers.
`;
		const zip = new JSZip();
		zip.file("01.md", md);
		const buf = await zip.generateAsync({ type: "uint8array" });
		const adapter = new MarkdownZipAdapter();
		const recipes = await adapter.parse(buf, { tempDir: "/tmp" });
		expect(recipes.length).toBe(1);
		expect(recipes[0]?.ingredients).toEqual([]);
		expect(recipes[0]?.steps).toEqual([]);
	});

	it("matches .zip whose name mentions .md", () => {
		const adapter = new MarkdownZipAdapter();
		expect(adapter.matches("recipes.md.zip", "application/zip")).toBe(true);
		expect(adapter.matches("recipes.jsonld.zip", "application/zip")).toBe(false);
	});
});

describe("pickAdapter dispatcher", () => {
	it("dispatches .jsonld to JsonLdAdapter", () => {
		expect(pickAdapter("recipes.jsonld", "application/json")).toBeInstanceOf(JsonLdAdapter);
	});
	it("dispatches .zip with 'jsonld' in name to JsonLdZipAdapter", () => {
		expect(pickAdapter("recipes.jsonld.zip", "application/zip")).toBeInstanceOf(JsonLdZipAdapter);
	});
	it("dispatches .zip with '.md' in name to MarkdownZipAdapter", () => {
		expect(pickAdapter("recipes.md.zip", "application/zip")).toBeInstanceOf(MarkdownZipAdapter);
	});
	it("returns null for unknown extensions", () => {
		const got: FileImportAdapter | null = pickAdapter("recipes.csv", "text/csv");
		expect(got).toBeNull();
	});
});

describe("normalizeTitle", () => {
	it("lowercases, collapses whitespace, strips leading/trailing punctuation", () => {
		expect(normalizeTitle("  Tiramisu!!!  ")).toBe("tiramisu");
		expect(normalizeTitle("Spaghetti   Bolognese")).toBe("spaghetti bolognese");
		expect(normalizeTitle("...test...")).toBe("test");
	});

	it("preserves diacritics (NFKC normalize keeps them)", () => {
		expect(normalizeTitle("Tarte aux amaretti")).toBe("tarte aux amaretti");
		expect(normalizeTitle("Târté")).toBe("târté");
	});
});
