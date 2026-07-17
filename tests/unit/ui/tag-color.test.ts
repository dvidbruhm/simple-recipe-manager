import { tagColor } from "@/ui/tag-color";

describe("tagColor", () => {
	it("is deterministic: same name always returns the same color", () => {
		expect(tagColor("dessert")).toBe(tagColor("dessert"));
	});

	it("returns a hex color string", () => {
		expect(tagColor("italian")).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it("distributes different names across palette entries", () => {
		const colors = new Set(
			["dessert", "italian", "dinner", "vegan", "soup", "breakfast", "lunch", "dessert"].map(
				(n) => tagColor(n),
			),
		);
		// 7 distinct names + 1 duplicate -> at most 7 unique colors
		expect(colors.size).toBeLessThanOrEqual(7);
		expect(colors.size).toBeGreaterThan(1);
	});
});
