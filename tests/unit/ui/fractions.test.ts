import { describe, expect, it } from "bun:test";
import { toFractions } from "@/ui/fractions";

describe("toFractions", () => {
	it("converts common decimals to fractions", () => {
		expect(toFractions("0.25 cup sugar")).toBe("1/4 cup sugar");
		expect(toFractions("0.5 tsp salt")).toBe("1/2 tsp salt");
		expect(toFractions("0.75 cup flour")).toBe("3/4 cup flour");
	});

	it("handles mixed numbers", () => {
		expect(toFractions("1.5 cups milk")).toBe("1 1/2 cups milk");
		expect(toFractions("2.25 kg")).toBe("2 1/4 kg");
	});

	it("handles thirds within tolerance", () => {
		expect(toFractions("0.33 cup")).toBe("1/3 cup");
		expect(toFractions("0.67 cup")).toBe("2/3 cup");
	});

	it("leaves whole numbers untouched", () => {
		expect(toFractions("2 eggs")).toBe("2 eggs");
		expect(toFractions("12 olives")).toBe("12 olives");
	});

	it("converts leading-dot decimals", () => {
		expect(toFractions(".5 lemon")).toBe("1/2 lemon");
	});

	it("converts multiple quantities in one line", () => {
		expect(toFractions("0.5 cup oil and 0.25 cup water")).toBe("1/2 cup oil and 1/4 cup water");
	});

	it("rounds a near-whole decimal", () => {
		expect(toFractions("2.0 cups")).toBe("2 cups");
	});
});
