import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { UserRepository } from "@/auth/users";
import { openDatabase } from "@/db/connection";
import { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";

const dataDir = process.env.DATA_DIR ?? "C:/data";
const email = process.argv[2] ?? "apps.david@pm.me";
const count = Number(process.argv[3] ?? 30);

const db = openDatabase(dataDir);
const users = new UserRepository(db);
const user = users.findByEmail(email);
if (!user) {
	console.error(`User not found: ${email}`);
	db.close();
	process.exit(1);
}

const recipes = new RecipeRepository(db, user.id);
const tags = new TagRepository(db, user.id);

const imagesDir = join(dataDir, "images");
mkdirSync(imagesDir, { recursive: true });

const ADJECTIVES = [
	"Spicy", "Creamy", "Crispy", "Smoky", "Tangy", "Sweet", "Savoury", "Roasted",
	"Grilled", "Braised", "Pickled", "Toasted", "Charred", "Slow-cooked", "Garlic",
	"Herb-crusted", "Lemon", "Honey-glazed", "Spiced", "Rustic",
];
const DISHES = [
	"Pasta", "Curry", "Stew", "Salad", "Soup", "Bowl", "Tacos", "Risotto",
	"Stir-fry", "Casserole", "Pie", "Bake", "Sandwich", "Burger", "Pizza",
	"Noodles", "Dumplings", "Skillet", "Roast", "Wedges", "Meatballs", "Ribs",
	"Flatbread", "Wrap", "Pancakes",
];
const REGIONS = ["Italian", "Thai", "Mexican", "Indian", "French", "Japanese", "Greek", "Korean", "Vietnamese", "Lebanese", "Spanish", "Moroccan"];
const PROTEINS = ["chicken", "tofu", "beef", "lamb", "chickpeas", "shrimp", "salmon", "mushrooms", "egg", "pork"];
const VEGETABLES = ["tomato", "onion", "garlic", "spinach", "kale", "broccoli", "carrot", "pepper", "zucchini", "eggplant", "potato", "sweet potato", "cauliflower", "cabbage"];
const HERBS = ["basil", "cilantro", "parsley", "mint", "thyme", "rosemary", "oregano", "dill"];
const SPICES = ["cumin", "paprika", "turmeric", "coriander", "chili flakes", "cinnamon", "black pepper"];
const PANTRY = ["olive oil", "soy sauce", "lemon", "lime", "vinegar", "sugar", "salt", "butter", "flour", "coconut milk", "yogurt", "parmesan"];
const TAGS = ["dinner", "lunch", "quick", "healthy", "vegan", "vegetarian", "comfort", "spicy", "batch", "summer", "winter", "weeknight", "celebration"];

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)] as T;
}
function pickN<T>(arr: T[], n: number): T[] {
	const copy = [...arr];
	const out: T[] = [];
	for (let i = 0; i < n && copy.length > 0; i++) {
		const idx = Math.floor(Math.random() * copy.length);
		out.push(copy.splice(idx, 1)[0] as T);
	}
	return out;
}

function randomColor(): { r: number; g: number; b: number } {
	return {
		r: 80 + Math.floor(Math.random() * 175),
		g: 80 + Math.floor(Math.random() * 175),
		b: 80 + Math.floor(Math.random() * 175),
	};
}

async function makeImage(): Promise<string> {
	const c1 = randomColor();
	const c2 = randomColor();
	const w = 400;
	const h = 300;
	// Build a simple vertical gradient as a raw RGBA buffer
	const buf = Buffer.alloc(w * h * 4);
	for (let y = 0; y < h; y++) {
		const t = y / (h - 1);
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			buf[i] = Math.round(c1.r + (c2.r - c1.r) * t);
			buf[i + 1] = Math.round(c1.g + (c2.g - c1.g) * t);
			buf[i + 2] = Math.round(c1.b + (c2.b - c1.b) * t);
			buf[i + 3] = 255;
		}
	}
	const id = randomBytes(8).toString("hex");
	const filename = `${id}.png`;
	await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
		.png()
		.toFile(join(imagesDir, filename));
	return filename;
}

const now = Date.now();

for (let i = 0; i < count; i++) {
	const title = `${pick(ADJECTIVES)} ${pick(REGIONS)} ${pick(DISHES)}`;
	const ingredients = [
		...pickN(PROTEINS, 1 + Math.floor(Math.random() * 2)).map((p) => `300g ${p}`),
		...pickN(VEGETABLES, 3 + Math.floor(Math.random() * 3)).map((v) => `1 ${v}`),
		...pickN(HERBS, 1 + Math.floor(Math.random() * 2)).map((h) => `Fresh ${h}`),
		...pickN(SPICES, 1 + Math.floor(Math.random() * 3)).map((s) => `1 tsp ${s}`),
		...pickN(PANTRY, 2 + Math.floor(Math.random() * 3)),
	];
	const steps = [
		`Prep the ${pick(VEGETABLES)} and ${pick(VEGETABLES)}.`,
		`Heat oil in a pan and brown the ${pick(PROTEINS)}.`,
		`Add the ${pick(SPICES)} and ${pick(HERBS)}; toast until fragrant.`,
		`Stir in the ${pick(VEGETABLES)} and simmer for 15 minutes.`,
		`Season with ${pick(PANTRY)} and serve hot.`,
	];
	const imageFilename = await makeImage();
	const id = recipes.insert({
		title,
		description: `A ${pick(ADJECTIVES).toLowerCase()} ${pick(REGIONS).toLowerCase()} dish.`,
		ingredients,
		steps,
		notes: Math.random() < 0.4 ? `Pairs well with ${pick(PANTRY)}.` : "",
		source_url: `https://example.com/recipes/${i}`,
		rating: Math.floor(Math.random() * 6),
		image_filename: imageFilename,
	});
	tags.replaceForRecipe(id, pickN(TAGS, 1 + Math.floor(Math.random() * 3)));

	// Spread created_at over the past `count` days so date sort shows variety
	const d = new Date(now - i * 24 * 60 * 60 * 1000);
	const pad = (n: number) => String(n).padStart(2, "0");
	const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
		d.getMinutes(),
	)}:${pad(d.getSeconds())}`;
	db.prepare("UPDATE recipes SET created_at = ? WHERE id = ?").run(iso, id);
}

db.close();
console.log(`Seeded ${count} recipes for ${email} into ${dataDir}/recipes.db`);
