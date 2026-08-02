import { describe, expect, it } from "bun:test";
import { formatQuantity, parseLeadingQuantity, scaleIngredientLine } from "@/ui/scaling";

describe("parseLeadingQuantity", () => {
	it("parses plain integers", () => {
		expect(parseLeadingQuantity("2 eggs")).toEqual({ value: 2, text: "2", end: 1 });
	});

	it("parses decimals", () => {
		expect(parseLeadingQuantity("1.5 cups flour")).toEqual({ value: 1.5, text: "1.5", end: 3 });
	});

	it("parses simple fractions", () => {
		expect(parseLeadingQuantity("1/2 cup oil")).toEqual({ value: 0.5, text: "1/2", end: 3 });
	});

	it("parses mixed numbers", () => {
		expect(parseLeadingQuantity("1 1/2 cups milk")).toEqual({
			value: 1.5,
			text: "1 1/2",
			end: 5,
		});
	});

	it("parses vulgar fraction characters", () => {
		expect(parseLeadingQuantity("½ tsp salt")).toEqual({ value: 0.5, text: "½", end: 1 });
	});

	it("uses the lower bound of a range", () => {
		expect(parseLeadingQuantity("1-2 cups sugar")).toEqual({
			value: 1,
			text: "1-2",
			end: 3,
		});
	});

	it("returns null when no leading number exists", () => {
		expect(parseLeadingQuantity("salt to taste")).toBeNull();
		expect(parseLeadingQuantity("")).toBeNull();
	});
});

describe("formatQuantity", () => {
	it("formats whole numbers without fractions", () => {
		expect(formatQuantity(2)).toBe("2");
		expect(formatQuantity(0)).toBe("0");
	});

	it("formats common fractions", () => {
		expect(formatQuantity(0.5)).toBe("1/2");
		expect(formatQuantity(0.25)).toBe("1/4");
		expect(formatQuantity(0.75)).toBe("3/4");
	});

	it("formats mixed numbers", () => {
		expect(formatQuantity(1.5)).toBe("1 1/2");
		expect(formatQuantity(2.25)).toBe("2 1/4");
	});

	it("falls back to decimal when not close to a small-denominator fraction", () => {
		expect(formatQuantity(0.41)).toBe("0.41");
	});
});

describe("scaleIngredientLine", () => {
	it("doubles an integer quantity", () => {
		expect(scaleIngredientLine("2 eggs", 2)).toBe("4 eggs");
	});

	it("halves a fraction", () => {
		expect(scaleIngredientLine("1/2 cup sugar", 0.5)).toBe("1/4 cup sugar");
	});

	it("scales a mixed number", () => {
		expect(scaleIngredientLine("1 1/2 cups flour", 2)).toBe("3 cups flour");
	});

	it("leaves lines without quantities untouched", () => {
		expect(scaleIngredientLine("salt to taste", 2)).toBe("salt to taste");
	});

	it("returns the original line when factor is 1", () => {
		expect(scaleIngredientLine("2 eggs", 1)).toBe("2 eggs");
	});

	it("scales a vulgar fraction", () => {
		expect(scaleIngredientLine("½ tsp salt", 3)).toBe("1 1/2 tsp salt");
	});
});
