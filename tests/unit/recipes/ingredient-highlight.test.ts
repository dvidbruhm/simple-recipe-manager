import { highlightIngredients, highlightSteps, sameWord } from "@/recipes/ingredient-highlight";

describe("sameWord", () => {
	it("matches exact words case-insensitively", () => {
		expect(sameWord("rice", "Rice")).toBe(true);
	});

	it("matches English plurals and trailing-e forms", () => {
		expect(sameWord("egg", "eggs")).toBe(true);
		expect(sameWord("tomato", "tomatoes")).toBe(true);
		expect(sameWord("olive", "olives")).toBe(true);
		expect(sameWord("potato", "potatoes")).toBe(true);
	});

	it("matches French plurals", () => {
		expect(sameWord("pomme", "pommes")).toBe(true);
		expect(sameWord("échalote", "échalotes")).toBe(true);
	});

	it("does not match unrelated words or substrings", () => {
		expect(sameWord("pea", "peanut")).toBe(false);
		expect(sameWord("rice", "rich")).toBe(false);
	});
});

describe("highlightIngredients", () => {
	it("highlights ingredient words that appear in steps", () => {
		const views = highlightIngredients(["200 g cooked rice"], ["Rinse the rice, then boil it."]);
		expect(views[0]?.hits).toEqual(["rice"]);
		expect(views[0]?.segments).toEqual([
			{ text: "200 g cooked ", hit: false },
			{ text: "rice", hit: true },
		]);
	});

	it("matches plurals between ingredients and steps", () => {
		const views = highlightIngredients(["2 eggs"], ["Whisk the egg mixture."]);
		expect(views[0]?.hits).toEqual(["eggs"]);
	});

	it("matches French elisions in steps", () => {
		const views = highlightIngredients(["1 oignon, diced"], ["Faites revenir l'oignon."]);
		expect(views[0]?.hits).toEqual(["oignon"]);
	});

	it("does not highlight prep words or units", () => {
		const views = highlightIngredients(["1 cup onion, chopped"], ["Add the chopped onion."]);
		expect(views[0]?.hits).toEqual(["onion"]);
		expect(views[0]?.segments?.some((s) => s.hit && s.text === "chopped")).toBe(false);
	});

	it("excludes compound unit phrases so their words never match", () => {
		const views = highlightIngredients(
			["2 c. à soupe d'huile d'olive"],
			["Ajoutez la soupe et l'huile."],
		);
		expect(views[0]?.hits).toEqual(["huile"]);
	});

	it("returns a single non-hit segment for empty or whitespace-only lines", () => {
		const views = highlightIngredients(["", "   "], ["Mix everything."]);
		expect(views[0]?.segments).toEqual([{ text: "", hit: false }]);
		expect(views[1]?.segments).toEqual([{ text: "   ", hit: false }]);
	});

	it("strips parentheticals before matching", () => {
		const views = highlightIngredients(["1 cup (226g) butter"], ["Melt the butter."]);
		expect(views[0]?.hits).toEqual(["butter"]);
	});

	it("skips section-header lines but still matches normal lines", () => {
		const views = highlightIngredients(
			["[Tomato gravy]", "1 tbsp soy sauce"],
			["Prepare the soy gravy."],
		);
		expect(views[0]?.hits).toEqual([]);
		expect(views[0]?.segments).toEqual([{ text: "[Tomato gravy]", hit: false }]);
		expect(views[1]?.hits).toEqual(["soy"]);
	});

	it("is word-boundary safe", () => {
		const views = highlightIngredients(["1 cup peas"], ["Toast the peanut."]);
		expect(views[0]?.hits).toEqual([]);
	});

	it("highlights staples like salt", () => {
		const views = highlightIngredients(["sel et poivre au goût"], ["Salez avec le sel."]);
		expect(views[0]?.hits).toEqual(["sel"]);
	});

	it("dedupes hits but marks every occurrence", () => {
		const views = highlightIngredients(["lemon zest and lemon juice"], ["Add the lemon zest."]);
		expect(views[0]?.hits).toEqual(["lemon", "zest"]);
		const hitTexts = views[0]?.segments.filter((s) => s.hit).map((s) => s.text);
		expect(hitTexts).toEqual(["lemon", "zest", "lemon"]);
	});

	it("returns no hits when steps are empty and preserves full text", () => {
		const views = highlightIngredients(["2 cups flour"], []);
		expect(views[0]?.hits).toEqual([]);
		expect(views[0]?.segments.map((s) => s.text).join("")).toBe("2 cups flour");
	});

	it("concatenated segments always equal the original line", () => {
		const lines = ["• 2 large eggs, separated", "[First marinade]", "1 1/2 tsp salt"];
		const views = highlightIngredients(lines, ["Add the eggs and salt."]);
		views.forEach((v, i) => {
			expect(v.segments.map((s) => s.text).join("")).toBe(lines[i] ?? "");
		});
	});

	it("filters plural forms of stoplist words", () => {
		const views = highlightIngredients(
			["6 tablespoons unsalted butter"],
			["Melt the butter in a tablespoon over low heat."],
		);
		expect(views[0]?.hits).toEqual(["butter"]);
	});

	it("filters the modifier word low", () => {
		const views = highlightIngredients(
			["1 quart low-sodium vegetable broth"],
			["Simmer the broth over low heat."],
		);
		expect(views[0]?.hits).toEqual(["broth"]);
	});

	it("filters the word serving(s)", () => {
		const views = highlightIngredients(
			["Cooked rice, for serving"],
			["Serve the rice on a serving platter."],
		);
		expect(views[0]?.hits).toEqual(["rice"]);
	});

	it("filters function words, containers and instruction words", () => {
		const views = highlightIngredients(
			["8 bowl-size slices rustic bread, toasted until crisp", "chives, for garnish"],
			["Place the bread bowls in the oven until the chive garnish browns."],
		);
		expect(views[0]?.hits).toEqual(["bread"]);
		expect(views[1]?.hits).toEqual(["chives"]);
	});
});

describe("highlightSteps", () => {
	it("marks step words matching ingredient hit words", () => {
		const views = highlightSteps(["Rinse the rice, then boil it."], ["rice"]);
		expect(views[0]?.segments).toEqual([
			{ text: "Rinse the ", kind: null },
			{ text: "rice", kind: "ingredient" },
			{ text: ", then boil it.", kind: null },
		]);
	});

	it("matches plural variants in steps", () => {
		const views = highlightSteps(["Whisk the eggs.", "Add one egg."], ["eggs"]);
		expect(views[0]?.segments.filter((s) => s.kind === "ingredient").map((s) => s.text)).toEqual([
			"eggs",
		]);
		expect(views[1]?.segments.filter((s) => s.kind === "ingredient").map((s) => s.text)).toEqual([
			"egg",
		]);
	});

	it("marks every occurrence in a step", () => {
		const views = highlightSteps(["Add lemon, then more lemon."], ["lemon"]);
		expect(views[0]?.segments.filter((s) => s.kind === "ingredient")).toHaveLength(2);
	});

	it("returns a single non-hit segment when there are no hit words", () => {
		const views = highlightSteps(["Just stir."], []);
		expect(views[0]?.segments).toEqual([{ text: "Just stir.", kind: null }]);
	});

	it("concatenated segments equal the original step", () => {
		const steps = ["Preheat oven to 400°F.", "L'oignon doit dorer."];
		const views = highlightSteps(steps, ["oignon"]);
		views.forEach((v, i) => {
			expect(v.segments.map((s) => s.text).join("")).toBe(steps[i] ?? "");
		});
	});

	it("marks durations with words, abbreviations and ranges", () => {
		const views = highlightSteps(
			["Bake for 20-30 minutes.", "Simmer 5 mins.", "Rest 1 1/4 hours.", "Chill for 90 seconds."],
			[],
		);
		expect(views[0]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"20-30 minutes",
		]);
		expect(views[1]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"5 mins",
		]);
		expect(views[2]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"1 1/4 hours",
		]);
		expect(views[3]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"90 seconds",
		]);
	});

	it("marks durations with filler words, 'to' ranges and French forms", () => {
		const views = highlightSteps(
			["Cook about 3-4 more minutes.", "Bake for 25 to 30 minutes.", "Cuire de 12 à 15 minutes."],
			[],
		);
		expect(views[0]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"3-4 more minutes",
		]);
		expect(views[1]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"25 to 30 minutes",
		]);
		expect(views[2]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"12 à 15 minutes",
		]);
	});

	it("does not mark numbers without time units", () => {
		const views = highlightSteps(["Use 2 cups of flour."], []);
		expect(views[0]?.segments.filter((s) => s.kind === "duration")).toHaveLength(0);
	});

	it("marks temperatures in common notations", () => {
		const views = highlightSteps(
			[
				"Preheat the oven to 400°F.",
				"Cuire à 180 °C.",
				"Until it reaches 165℉ (74℃).",
				"Bake at 350 degrees.",
				"A 220 Celsius oven.",
				"Grill at 400 F.",
			],
			[],
		);
		const temps = views.map((v) =>
			v.segments.filter((s) => s.kind === "temperature").map((s) => s.text),
		);
		expect(temps[0]).toEqual(["400°F"]);
		expect(temps[1]).toEqual(["180 °C"]);
		expect(temps[2]).toEqual(["165℉", "74℃"]);
		expect(temps[3]).toEqual(["350 degrees"]);
		expect(temps[4]).toEqual(["220 Celsius"]);
		expect(temps[5]).toEqual(["400 F"]);
	});

	it("does not mark bare numbers as temperatures", () => {
		const views = highlightSteps(["Preheat oven to 400."], []);
		expect(views[0]?.segments.filter((s) => s.kind === "temperature")).toHaveLength(0);
	});

	it("does not mark the c of 'c. à soupe' as a temperature", () => {
		const views = highlightSteps(["Ajoutez 30 ml (2 c. à soupe) d'huile."], []);
		expect(views[0]?.segments.filter((s) => s.kind === "temperature")).toHaveLength(0);
	});

	it("does not mark bare cup abbreviations as temperatures", () => {
		const views = highlightSteps(["Add 2 C flour.", "Ajoutez 2 C à soupe d'huile."], []);
		expect(views[0]?.segments.filter((s) => s.kind === "temperature")).toHaveLength(0);
		expect(views[1]?.segments.filter((s) => s.kind === "temperature")).toHaveLength(0);
	});

	it("marks a degree word followed by F or C as one temperature", () => {
		const views = highlightSteps(["Preheat to 350 degrees C."], []);
		expect(views[0]?.segments.filter((s) => s.kind === "temperature").map((s) => s.text)).toEqual([
			"350 degrees C",
		]);
	});

	it("marks em-dash duration ranges", () => {
		const views = highlightSteps(["Bake 25—30 minutes."], []);
		expect(views[0]?.segments.filter((s) => s.kind === "duration").map((s) => s.text)).toEqual([
			"25—30 minutes",
		]);
	});

	it("marks ingredients, durations and temperatures in the same step", () => {
		const views = highlightSteps(["Sauté the onion for 5 minutes at 350°F."], ["onion"]);
		expect(views[0]?.segments).toEqual([
			{ text: "Sauté the ", kind: null },
			{ text: "onion", kind: "ingredient" },
			{ text: " for ", kind: null },
			{ text: "5 minutes", kind: "duration" },
			{ text: " at ", kind: null },
			{ text: "350°F", kind: "temperature" },
			{ text: ".", kind: null },
		]);
	});

	it("keeps segments contiguous with mixed highlight kinds", () => {
		const steps = [
			"Bake 20-30 minutes at 400°F (235°C), then rest the rice for 1 hour.",
			"Cuire de 12 à 15 minutes à 180 °C.",
		];
		const views = highlightSteps(steps, ["rice"]);
		views.forEach((v, i) => {
			expect(v.segments.map((s) => s.text).join("")).toBe(steps[i] ?? "");
		});
	});
});
