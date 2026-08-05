# Ingredient–Step Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the recipe view page, highlight (bold + themed tint) every ingredient word that is mentioned in any step.

**Architecture:** Server-side matching module (`src/recipes/ingredient-highlight.ts`) extracts candidate food words from ingredient lines (stripping quantities/units/parentheticals/section headers, filtering a bilingual stoplist) and matches them against step text with plural-tolerant comparison. The route passes per-line segments to the Nunjucks template, which renders `<mark class="ing-hit">` around hits and stores hit words in a `data-hl` attribute; `servings.js` re-applies the marks after it rewrites ingredient text during scaling. One CSS rule using `--color-star` fits all themes.

**Tech Stack:** Hono + Bun, Nunjucks SSR, vanilla JS (no build step) in `src/ui/static/`, Tailwind v4 source CSS, `bun test`, Biome.

**Spec:** `docs/superpowers/specs/2026-08-04-ingredient-highlight-design.md`

**Commits:** commit steps are included but MUST only be executed if the user explicitly asks for commits.

**Conventions:** tabs for indentation (Biome enforces), tests use global `describe`/`it`/`expect` (bun test), path alias `@/` → `src/`. If `bun run lint` reports formatting errors on new files, run `bun run format` and re-check.

---

### Task 1: Matching module (TDD)

**Files:**
- Create: `src/recipes/ingredient-highlight.ts`
- Test: `tests/unit/recipes/ingredient-highlight.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/recipes/ingredient-highlight.test.ts`:

```ts
import { highlightIngredients, sameWord } from "@/recipes/ingredient-highlight";

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
		expect(views[0]?.hits).toEqual(["onion"]);
	});

	it("does not highlight prep words or units", () => {
		const views = highlightIngredients(["1 onion, chopped"], ["Add the chopped onion."]);
		expect(views[0]?.hits).toEqual(["onion"]);
		expect(views[0]?.segments?.some((s) => s.hit && s.text === "chopped")).toBe(false);
	});

	it("strips parentheticals before matching", () => {
		const views = highlightIngredients(["1 cup (226g) butter"], ["Melt the butter."]);
		expect(views[0]?.hits).toEqual(["butter"]);
	});

	it("skips section-header lines but still matches normal lines", () => {
		const views = highlightIngredients(["[Tomato gravy]", "1 tbsp soy sauce"], [
			"Prepare the soy gravy.",
		]);
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
			expect(v.segments.map((s) => s.text).join("")).toBe(lines[i]);
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/recipes/ingredient-highlight.test.ts`
Expected: FAIL — cannot resolve `@/recipes/ingredient-highlight`.

- [ ] **Step 3: Implement the module**

Create `src/recipes/ingredient-highlight.ts`:

```ts
export interface IngredientSegment {
	text: string;
	hit: boolean;
}

export interface IngredientView {
	original: string;
	segments: IngredientSegment[];
	hits: string[];
}

const UNIT_PHRASES = ["c. à soupe", "c. à thé", "c. à table"];

const STOPLIST = new Set<string>([
	// units
	"g", "kg", "ml", "cl", "dl", "l", "oz", "lb", "lbs", "cup", "cups", "tasse", "tasses",
	"tbsp", "tsp", "tablespoon", "teaspoon", "pint", "quart", "pinch", "pincée", "dash",
	"can", "tin", "boîte", "packet", "stick", "head", "clove", "cloves", "gousse", "gousses",
	"sprig", "sprigs", "branche", "thumb", "piece", "slice", "slices", "tranche", "tranches",
	"liter", "litre", "liters", "litres",
	// function words
	"of", "the", "a", "an", "and", "or", "to", "into", "for", "with", "about", "approx",
	"approximately", "environ", "plus", "more", "less", "as", "needed", "required", "optional",
	"facultatif", "divided", "separated", "taste", "goût", "room", "temperature", "ambiante",
	"very", "some", "few", "each", "all", "tout", "toute", "enough", "suffisante", "quantity",
	"de", "du", "le", "la", "les", "un", "une", "des", "au", "aux", "en", "par", "sur",
	"dans", "et", "ou", "pour", "avec", "sans", "desired", "désiré",
	// prep / modifier words
	"chopped", "finely", "minced", "diced", "sliced", "crushed", "grated", "shredded", "peeled",
	"smashed", "rinsed", "drained", "cooked", "softened", "melted", "toasted", "roasted",
	"frozen", "thawed", "fresh", "dried", "ground", "kosher", "coarse", "fine", "roughly",
	"thinly", "thickly", "cut", "halved", "quartered", "juiced", "zested", "washed", "stemmed",
	"seeded", "picked", "torn", "broken", "whole", "large", "small", "medium",
	"haché", "hachée", "hachées", "coupé", "coupée", "coupés", "coupées", "émincé", "émincée",
	"émincés", "râpé", "râpée", "pressé", "pressée", "pelé", "pelée", "pelés", "cuit", "cuite",
	"cuits", "cuites", "rincé", "rincés", "rincée", "égoutté", "égouttés", "égouttée", "fondu",
	"fondue", "ramolli", "ramollie", "tempéré", "tempérés", "frais", "fraîche", "surgelé",
	"surgelés", "surgelées", "séché", "séchées", "moulu", "moulue", "entier", "entière",
	"gros", "grosse", "petit", "petite", "moyen", "moyenne", "doux", "douce", "grillé",
	"grillée", "lavé", "lavée", "équeuté", "épépiné", "concassé", "concassées", "taillé",
	"taillée", "dés", "julienne", "biseau", "quartiers", "morceaux",
]);

const TOKEN_RE = /\p{L}+/gu;

interface Token {
	text: string;
	start: number;
	end: number;
}

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	for (const m of text.matchAll(TOKEN_RE)) {
		const start = m.index ?? 0;
		tokens.push({ text: m[0], start, end: start + m[0].length });
	}
	return tokens;
}

function normalize(word: string): string {
	return word.normalize("NFKC").toLowerCase();
}

function stem(word: string): string {
	if (word.length > 1 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
	return word;
}

export function sameWord(a: string, b: string): boolean {
	const sa = stem(normalize(a));
	const sb = stem(normalize(b));
	if (sa === sb) return true;
	return sa === `${sb}e` || `${sa}e` === sb;
}

function excludedRanges(line: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	for (const m of line.matchAll(/\([^)]*\)/g)) {
		const start = m.index ?? 0;
		ranges.push([start, start + m[0].length]);
	}
	const lower = line.toLowerCase();
	for (const phrase of UNIT_PHRASES) {
		let from = 0;
		for (;;) {
			const idx = lower.indexOf(phrase, from);
			if (idx === -1) break;
			ranges.push([idx, idx + phrase.length]);
			from = idx + phrase.length;
		}
	}
	return ranges;
}

function inExcluded(pos: number, ranges: Array<[number, number]>): boolean {
	return ranges.some(([start, end]) => pos >= start && pos < end);
}

export function highlightIngredients(ingredients: string[], steps: string[]): IngredientView[] {
	const corpus = tokenize(steps.join("\n")).map((t) => normalize(t.text));

	return ingredients.map((original) => {
		if (!original.trim() || /^\s*\[.*\]\s*$/.test(original)) {
			return { original, segments: [{ text: original, hit: false }], hits: [] };
		}
		const ranges = excludedRanges(original);
		const segments: IngredientSegment[] = [];
		const hits: string[] = [];
		const seen = new Set<string>();
		let cursor = 0;
		for (const tok of tokenize(original)) {
			if (inExcluded(tok.start, ranges)) continue;
			const norm = normalize(tok.text);
			if (tok.text.length < 3 || STOPLIST.has(norm)) continue;
			if (!corpus.some((c) => sameWord(tok.text, c))) continue;
			if (tok.start > cursor) {
				segments.push({ text: original.slice(cursor, tok.start), hit: false });
			}
			segments.push({ text: tok.text, hit: true });
			cursor = tok.end;
			if (!seen.has(norm)) {
				seen.add(norm);
				hits.push(tok.text);
			}
		}
		if (cursor < original.length) {
			segments.push({ text: original.slice(cursor), hit: false });
		}
		if (segments.length === 0) {
			segments.push({ text: original, hit: false });
		}
		return { original, segments, hits };
	});
}
```

Note: `large`, `small`, `medium` extend the spec's v1 stoplist (English size modifiers, mirroring the French `gros`/`petit`/`moyen` already listed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/recipes/ingredient-highlight.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit (only if user asked for commits)**

```bash
git add src/recipes/ingredient-highlight.ts tests/unit/recipes/ingredient-highlight.test.ts
git commit -m "feat: ingredient-step highlight matching module"
```

---

### Task 2: Route + template wiring

**Files:**
- Modify: `src/recipes/routes.ts` (import block at top; `GET /recipes/:id` handler at lines ~314-328)
- Modify: `src/ui/templates/recipe-view.html` (ingredient list, lines 43-49)
- Test: `tests/http/recipe-view-edit.test.ts` (append one test)

- [ ] **Step 1: Write the failing HTTP test**

Append inside `describe("recipe view & edit pages", ...)` in `tests/http/recipe-view-edit.test.ts`:

```ts
	it("GET /recipes/:id highlights ingredient words that appear in steps", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.set("title", "Rice Bowl");
		fd.set("ingredients", "200 g cooked rice\n1 onion, chopped");
		fd.set("steps", "Rinse the rice, then sauté the onion.");
		fd.set("rating", "0");
		fd.set("tags", "");
		await app.request(`/recipes/${id1}`, {
			method: "POST",
			body: fd,
			headers: { Cookie: `session=${cookie}` },
		});
		const res = await app.request(`/recipes/${id1}`, auth(cookie));
		const body = await res.text();
		expect(body).toContain('<mark class="ing-hit">rice</mark>');
		expect(body).toContain('<mark class="ing-hit">onion</mark>');
		expect(body).toContain('data-hl="rice"');
		expect(body).toContain('data-hl="onion"');
		expect(body).not.toContain('<mark class="ing-hit">chopped</mark>');
		expect(body).not.toContain('<mark class="ing-hit">cooked</mark>');
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/http/recipe-view-edit.test.ts -t "highlights ingredient words"`
Expected: FAIL — no `<mark class="ing-hit">` in body.

- [ ] **Step 3: Wire the route**

In `src/recipes/routes.ts`, add the import next to the other local imports at the top of the file:

```ts
import { highlightIngredients } from "./ingredient-highlight";
```

In the `GET /recipes/:id` handler, change the render call from:

```ts
		return c.html(
			render("recipe-view.html", {
				r: recipe,
				tags: tagRows.map((t) => t.name),
				title: recipe.title,
				...themeVars(c),
			}),
		);
```

to:

```ts
		return c.html(
			render("recipe-view.html", {
				r: recipe,
				ingredients: highlightIngredients(recipe.ingredients, recipe.steps),
				tags: tagRows.map((t) => t.name),
				title: recipe.title,
				...themeVars(c),
			}),
		);
```

- [ ] **Step 4: Update the template**

In `src/ui/templates/recipe-view.html`, replace the ingredient list block (lines 43-49):

```html
      <ul class="list-none space-y-1">
        {% for ing in r.ingredients %}
          <li><label class="flex items-start gap-2 cursor-pointer text-[color:var(--color-text)]"><input type="checkbox" class="mt-1 ing-check" data-ing="{{ loop.index0 }}"> <span data-original="{{ ing }}">{{ ing | fractions }}</span></label></li>
        {% else %}
          <li class="text-[color:var(--color-muted)]">No ingredients listed.</li>
        {% endfor %}
      </ul>
```

with:

```html
      <ul class="list-none space-y-1">
        {% for ing in ingredients %}
          <li><label class="flex items-start gap-2 cursor-pointer text-[color:var(--color-text)]"><input type="checkbox" class="mt-1 ing-check" data-ing="{{ loop.index0 }}"> <span data-original="{{ ing.original }}" data-hl="{{ ing.hits | join(',') }}">{% for seg in ing.segments %}{% if seg.hit %}<mark class="ing-hit">{{ seg.text | fractions }}</mark>{% else %}{{ seg.text | fractions }}{% endif %}{% endfor %}</span></label></li>
        {% else %}
          <li class="text-[color:var(--color-muted)]">No ingredients listed.</li>
        {% endfor %}
      </ul>
```

Notes: the nunjucks env has `throwOnUndefined: true`, and this is the only template render of `recipe-view.html` (the route change above supplies `ingredients`). Keep the inner `{% for %}` on one line so no stray whitespace lands inside the span.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/http/recipe-view-edit.test.ts`
Expected: all PASS (new test + existing ones, including the `data-original="2 eggs"` assertion which must still hold).

- [ ] **Step 6: Commit (only if user asked for commits)**

```bash
git add src/recipes/routes.ts src/ui/templates/recipe-view.html tests/http/recipe-view-edit.test.ts
git commit -m "feat: render ingredient-step highlights on recipe view"
```

---

### Task 3: Servings re-marking

**Files:**
- Modify: `src/ui/static/servings.js`

`apply()` sets `span.textContent` in two branches, wiping the server-rendered `<mark>`s. After each assignment, re-wrap the words listed in `data-hl`.

- [ ] **Step 1: Add the remark helpers**

In `src/ui/static/servings.js`, add these two functions inside the IIFE, immediately above `function initAll()`:

```js
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function remark(span) {
    const words = (span.getAttribute("data-hl") || "").split(",").map((w) => w.trim()).filter(Boolean);
    const text = span.textContent || "";
    if (words.length === 0 || !text) return;
    const re = new RegExp(`(^|[^\\p{L}])(${words.map(escapeRegExp).join("|")})(?![\\p{L}])`, "giu");
    span.textContent = "";
    let last = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index + m[1].length;
      if (start > last) span.appendChild(document.createTextNode(text.slice(last, start)));
      const mark = document.createElement("mark");
      mark.className = "ing-hit";
      mark.textContent = m[2];
      span.appendChild(mark);
      last = start + m[2].length;
    }
    if (last < text.length) span.appendChild(document.createTextNode(text.slice(last)));
  }
```

- [ ] **Step 2: Call remark after every text rewrite**

In the same file, change the invalid-input branch of `apply()` from:

```js
          spans.forEach((s) => {
            s.textContent = s.getAttribute("data-original") || "";
          });
```

to:

```js
          spans.forEach((s) => {
            s.textContent = s.getAttribute("data-original") || "";
            remark(s);
          });
```

and the scaling branch from:

```js
        spans.forEach((s) => {
          const original = s.getAttribute("data-original") || "";
          s.textContent = scaleLine(original, factor);
        });
```

to:

```js
        spans.forEach((s) => {
          const original = s.getAttribute("data-original") || "";
          s.textContent = scaleLine(original, factor);
          remark(s);
        });
```

- [ ] **Step 3: Verify nothing regressed**

Run: `bun test`
Expected: all tests PASS (there are no DOM tests for static JS in this repo; correctness of `remark` is guaranteed by construction — it rebuilds from `textContent` each time and uses the same boundary rule as the server module — plus the manual check in Task 5).

- [ ] **Step 4: Commit (only if user asked for commits)**

```bash
git add src/ui/static/servings.js
git commit -m "feat: re-apply ingredient highlights after servings scaling"
```

---

### Task 4: Highlight styling

**Files:**
- Modify: `src/ui/css/app.tailwind.css` (after the `.ingredients` checkbox rules, ~line 418)
- Regenerate: `src/ui/static/app.css` (tracked in git)

- [ ] **Step 1: Add the base rule**

In `src/ui/css/app.tailwind.css`, after this existing block (ends ~line 418):

```css
.ingredients input[type="checkbox"]:hover {
	border-color: var(--color-accent);
}
```

add:

```css
mark.ing-hit {
	font-weight: 700;
	color: inherit;
	background: color-mix(in srgb, var(--color-star) 40%, transparent);
	border-radius: 3px;
	padding: 0 0.15em;
	-webkit-box-decoration-break: clone;
	box-decoration-break: clone;
}
@media print {
	mark.ing-hit {
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}
}
```

`color: inherit` overrides the browser default `<mark>` styling; `--color-star` is defined for all 7 themes (verified against `css-coverage.test.ts`), so every theme gets a fitting tint without per-theme overrides.

- [ ] **Step 2: Rebuild the shipped CSS**

Run: `bun run build:css`
Expected: `src/ui/static/app.css` regenerated without errors.

- [ ] **Step 3: Verify the rule shipped**

Run (PowerShell): `Select-String -Path src\ui\static\app.css -Pattern "ing-hit"`
Expected: at least one match.

- [ ] **Step 4: Commit (only if user asked for commits)**

```bash
git add src/ui/css/app.tailwind.css src/ui/static/app.css
git commit -m "feat: themed highlight style for ingredient-step matches"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all tests PASS (previous count was 306; new unit + HTTP tests added).

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: no errors. If Biome reports formatting issues on the new/changed files, run `bun run format` and re-run lint.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `bun run dev`, open a recipe whose steps mention its ingredients (e.g. import the RecipeSage export or use any seeded recipe):
- Ingredient words mentioned in steps render bold with a tinted background.
- Change the servings value: quantities rescale and highlights remain.
- Reset servings: original text and highlights return.
- Check one non-neutral theme (e.g. hearth): tint still looks fitting.
- Print preview: highlights visible.
