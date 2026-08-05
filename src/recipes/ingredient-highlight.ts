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
	"g",
	"kg",
	"ml",
	"cl",
	"dl",
	"l",
	"oz",
	"lb",
	"lbs",
	"cup",
	"cups",
	"tasse",
	"tasses",
	"tbsp",
	"tsp",
	"tablespoon",
	"teaspoon",
	"pint",
	"quart",
	"pinch",
	"pincée",
	"dash",
	"can",
	"tin",
	"boîte",
	"packet",
	"stick",
	"head",
	"clove",
	"cloves",
	"gousse",
	"gousses",
	"sprig",
	"sprigs",
	"branche",
	"thumb",
	"piece",
	"slice",
	"slices",
	"tranche",
	"tranches",
	"liter",
	"litre",
	"liters",
	"litres",
	"bowl",
	"bowls",
	"pan",
	"pans",
	"pot",
	"pots",
	"skillet",
	"skillets",
	"sheet",
	"sheets",
	"dish",
	"dishes",
	"tray",
	"trays",
	"plate",
	"plates",
	"mold",
	"molds",
	"mould",
	"moulds",
	"container",
	"containers",
	"jar",
	"jars",
	// function words
	"of",
	"the",
	"a",
	"an",
	"and",
	"or",
	"to",
	"into",
	"for",
	"with",
	"about",
	"approx",
	"approximately",
	"environ",
	"plus",
	"more",
	"less",
	"as",
	"needed",
	"required",
	"optional",
	"facultatif",
	"divided",
	"separated",
	"serving",
	"taste",
	"goût",
	"room",
	"temperature",
	"ambiante",
	"very",
	"some",
	"few",
	"each",
	"all",
	"tout",
	"toute",
	"enough",
	"suffisante",
	"quantity",
	"de",
	"du",
	"le",
	"la",
	"les",
	"un",
	"une",
	"des",
	"au",
	"aux",
	"en",
	"par",
	"sur",
	"dans",
	"et",
	"ou",
	"pour",
	"avec",
	"sans",
	"desired",
	"désiré",
	"until",
	"onto",
	"over",
	"under",
	"then",
	"than",
	"you",
	"your",
	"it",
	"its",
	"any",
	"both",
	"size",
	// prep / modifier words
	"chopped",
	"finely",
	"minced",
	"diced",
	"sliced",
	"crushed",
	"grated",
	"shredded",
	"peeled",
	"smashed",
	"rinsed",
	"drained",
	"cooked",
	"softened",
	"melted",
	"toasted",
	"roasted",
	"frozen",
	"thawed",
	"fresh",
	"dried",
	"ground",
	"kosher",
	"coarse",
	"fine",
	"roughly",
	"thinly",
	"thickly",
	"cut",
	"halved",
	"quartered",
	"juiced",
	"zested",
	"washed",
	"stemmed",
	"seeded",
	"picked",
	"torn",
	"broken",
	"whole",
	"large",
	"small",
	"medium",
	"low",
	"haché",
	"hachée",
	"hachées",
	"coupé",
	"coupée",
	"coupés",
	"coupées",
	"émincé",
	"émincée",
	"émincés",
	"râpé",
	"râpée",
	"pressé",
	"pressée",
	"pelé",
	"pelée",
	"pelés",
	"cuit",
	"cuite",
	"cuits",
	"cuites",
	"rincé",
	"rincés",
	"rincée",
	"égoutté",
	"égouttés",
	"égouttée",
	"fondu",
	"fondue",
	"ramolli",
	"ramollie",
	"tempéré",
	"tempérés",
	"frais",
	"fraîche",
	"surgelé",
	"surgelés",
	"surgelées",
	"séché",
	"séchées",
	"moulu",
	"moulue",
	"entier",
	"entière",
	"gros",
	"grosse",
	"petit",
	"petite",
	"moyen",
	"moyenne",
	"doux",
	"douce",
	"grillé",
	"grillée",
	"lavé",
	"lavée",
	"équeuté",
	"épépiné",
	"concassé",
	"concassées",
	"taillé",
	"taillée",
	"dés",
	"julienne",
	"biseau",
	"quartiers",
	"morceaux",
	"garnish",
	"garnished",
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

function inExcludedRange(pos: number, ranges: Array<[number, number]>): boolean {
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
			if (inExcludedRange(tok.start, ranges)) continue;
			const norm = normalize(tok.text);
			if (tok.text.length < 3 || STOPLIST.has(norm) || STOPLIST.has(stem(norm))) continue;
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
		return { original, segments, hits };
	});
}

export type HighlightKind = "ingredient" | "duration" | "temperature";

export interface StepSegment {
	text: string;
	kind: HighlightKind | null;
}

export interface StepView {
	original: string;
	segments: StepSegment[];
}

const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?`;
const DURATION_RE = new RegExp(
	`(?:${NUM})(?:\\s*(?:[-–—]|à|to)\\s*(?:${NUM}))?(?:\\s+\\p{L}+)?\\s*(?:seconds?|secs?|secondes?|minutes?|mins?|hours?|hrs?|heures?|days?|jours?|h)\\b`,
	"giu",
);
const TEMPERATURE_RE = new RegExp(
	`(?:${NUM})\\s*(?:°\\s*[FCfc]?|℉|℃|[FC]\\b(?!\\.?\\s*à)|(?:[Dd]egrees?|[Dd]egrés?)(?:\\s*[FCfc]\\b)?|[Ff]ahrenheit\\b|[Cc]elsius\\b)`,
	"gu",
);

interface HighlightRange {
	start: number;
	end: number;
	kind: HighlightKind;
}

export function highlightSteps(steps: string[], hitWords: string[]): StepView[] {
	return steps.map((original) => {
		const ranges: HighlightRange[] = [];
		if (hitWords.length > 0) {
			for (const tok of tokenize(original)) {
				if (tok.text.length < 3) continue;
				if (!hitWords.some((h) => sameWord(tok.text, h))) continue;
				ranges.push({ start: tok.start, end: tok.end, kind: "ingredient" });
			}
		}
		for (const m of original.matchAll(DURATION_RE)) {
			const start = m.index ?? 0;
			ranges.push({ start, end: start + m[0].length, kind: "duration" });
		}
		for (const m of original.matchAll(TEMPERATURE_RE)) {
			const start = m.index ?? 0;
			const text = m[0];
			// A bare "N C"/"N F" (no degree sign or word form) is ambiguous with cup
			// measures ("2 C flour"); only accept it as a temperature when the value is
			// plausibly hot (>= 50), which cup quantities never reach.
			const bare = !/[°℉℃]/.test(text) && !/degrees?|degrés?|fahrenheit|celsius/i.test(text);
			if (bare) {
				const value = Number.parseFloat(text.replace(",", "."));
				if (!Number.isFinite(value) || value < 50) continue;
			}
			ranges.push({ start, end: start + text.length, kind: "temperature" });
		}
		ranges.sort((a, b) => a.start - b.start || b.end - a.end);

		const segments: StepSegment[] = [];
		let cursor = 0;
		for (const r of ranges) {
			if (r.start < cursor) continue;
			if (r.start > cursor) {
				segments.push({ text: original.slice(cursor, r.start), kind: null });
			}
			segments.push({ text: original.slice(r.start, r.end), kind: r.kind });
			cursor = r.end;
		}
		if (cursor < original.length) {
			segments.push({ text: original.slice(cursor), kind: null });
		}
		if (segments.length === 0) {
			segments.push({ text: original, kind: null });
		}
		return { original, segments };
	});
}
