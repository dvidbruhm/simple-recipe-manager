import { openDatabase } from "@/db/connection";
import { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";

const dataDir = process.env.DATA_DIR ?? "/data";
const db = openDatabase(dataDir);
const recipes = new RecipeRepository(db);
const tags = new TagRepository(db);

const IMAGES = ["b2537bba-802e-47a5-90a4-9212635a7a1e.jpg", "c8046f41-0495-438b-aaf5-0a93a3c5a5df.jpg"];

type Seed = {
	title: string;
	description: string;
	ingredients: string[];
	steps: string[];
	rating: number;
	source_url: string;
	tags: string[];
	image: boolean;
};

const data: Seed[] = [
	{
		title: "Spaghetti Carbonara",
		description: "Creamy Roman pasta with eggs, pancetta and pecorino.",
		ingredients: ["200g spaghetti", "100g pancetta", "2 egg yolks", "50g pecorino", "Black pepper"],
		steps: ["Boil pasta", "Fry pancetta", "Whisk yolks and cheese", "Toss everything together off the heat"],
		rating: 5,
		source_url: "https://www.bbcgoodfood.com/recipes/spaghetti-carbonara",
		tags: ["italian", "dinner", "quick"],
		image: true,
	},
	{
		title: "Chocolate Lava Cake",
		description: "Individual cakes with a molten chocolate centre.",
		ingredients: ["100g dark chocolate", "100g butter", "2 eggs", "60g sugar", "40g flour"],
		steps: ["Melt chocolate and butter", "Whisk in eggs and sugar", "Fold in flour", "Bake 10 minutes at 200C"],
		rating: 5,
		source_url: "https://www.allrecipes.com/recipe/molten-chocolate-lava-cake",
		tags: ["dessert", "baking"],
		image: false,
	},
	{
		title: "Vegan Buddha Bowl",
		description: "A colourful bowl of roasted veg, grains and tahini.",
		ingredients: ["1 cup quinoa", "Sweet potato", "Chickpeas", "Kale", "Tahini", "Lemon"],
		steps: ["Cook quinoa", "Roast sweet potato and chickpeas", "Massage kale", "Drizzle with tahini sauce"],
		rating: 4,
		source_url: "https://minimalistbaker.com/easy-buddha-bowl",
		tags: ["vegan", "healthy", "dinner"],
		image: true,
	},
	{
		title: "Chicken Tikka Masala",
		description: "Grilled chicken in a spiced tomato cream sauce.",
		ingredients: ["Chicken thighs", "Yogurt", "Garam masala", "Tomato", "Cream", "Onion"],
		steps: ["Marinate chicken in yogurt and spices", "Grill until charred", "Simmer sauce", "Combine and finish with cream"],
		rating: 5,
		source_url: "https://www.seriouseats.com/chicken-tikka-masala",
		tags: ["asian", "dinner"],
		image: false,
	},
	{
		title: "Avocado Toast",
		description: "Quick smashed avocado on crusty bread.",
		ingredients: ["2 slices sourdough", "1 ripe avocado", "Lemon", "Chili flakes", "Salt"],
		steps: ["Toast the bread", "Mash avocado with lemon and salt", "Spread and top with chili flakes"],
		rating: 3,
		source_url: "https://www.bbcgoodfood.com/recipes/avocado-toast",
		tags: ["breakfast", "quick", "vegan"],
		image: true,
	},
	{
		title: "Tomato Basil Soup",
		description: "Silky roasted tomato soup with fresh basil.",
		ingredients: ["1kg tomatoes", "1 onion", "Garlic", "Basil", "Olive oil", "Stock"],
		steps: ["Roast tomatoes, onion and garlic", "Blend with stock", "Add basil", "Season and serve"],
		rating: 4,
		source_url: "https://www.allrecipes.com/recipe/tomato-basil-soup",
		tags: ["soup", "vegan", "quick"],
		image: false,
	},
	{
		title: "Beef Tacos",
		description: "Spiced beef in soft tortillas with lime and cilantro.",
		ingredients: ["500g beef mince", "Taco seasoning", "Tortillas", "Lime", "Cilantro", "Onion"],
		steps: ["Brown the beef", "Add seasoning and water", "Simmer until thick", "Fill tortillas and top"],
		rating: 4,
		source_url: "https://www.foodnetwork.com/recipes/beef-tacos",
		tags: ["mexican", "dinner"],
		image: true,
	},
	{
		title: "Fluffy Pancakes",
		description: "Light and fluffy breakfast stack with maple syrup.",
		ingredients: ["200g flour", "2 eggs", "300ml milk", "Baking powder", "Sugar", "Butter"],
		steps: ["Whisk wet and dry ingredients", "Rest 10 minutes", "Cook on a hot griddle", "Serve with syrup"],
		rating: 4,
		source_url: "https://www.allrecipes.com/recipe/fluffy-pancakes",
		tags: ["breakfast", "dessert"],
		image: false,
	},
	{
		title: "Pad Thai",
		description: "Stir-fried rice noodles with tamarind and peanuts.",
		ingredients: ["Rice noodles", "Shrimp", "Eggs", "Bean sprouts", "Tamarind paste", "Peanuts"],
		steps: ["Soak noodles", "Stir-fry shrimp and push aside", "Scramble eggs", "Toss with noodles and tamarind sauce"],
		rating: 5,
		source_url: "https://www.seriouseats.com/pad-thai",
		tags: ["asian", "dinner"],
		image: true,
	},
	{
		title: "Caesar Salad",
		description: "Crisp romaine with creamy dressing and croutons.",
		ingredients: ["Romaine lettuce", "Parmesan", "Bread", "Anchovy", "Egg yolk", "Lemon"],
		steps: ["Make croutons", "Whisk dressing", "Toss lettuce", "Top with parmesan"],
		rating: 3,
		source_url: "https://www.bbcgoodfood.com/recipes/caesar-salad",
		tags: ["quick", "healthy"],
		image: false,
	},
	{
		title: "Banana Bread",
		description: "Moist loaf with toasted walnuts.",
		ingredients: ["3 ripe bananas", "200g flour", "100g sugar", "Butter", "2 eggs", "Walnuts"],
		steps: ["Mash bananas", "Mix wet and dry", "Fold in walnuts", "Bake 50 minutes at 180C"],
		rating: 4,
		source_url: "https://www.allrecipes.com/recipe/banana-banana-bread",
		tags: ["dessert", "baking", "breakfast"],
		image: true,
	},
	{
		title: "Margherita Pizza",
		description: "Classic Neapolitan pizza with tomato and mozzarella.",
		ingredients: ["Pizza dough", "San Marzano tomatoes", "Mozzarella", "Basil", "Olive oil"],
		steps: ["Stretch dough", "Spread tomato", "Add mozzarella", "Bake at maximum heat", "Top with basil"],
		rating: 5,
		source_url: "https://www.seriouseats.com/margherita-pizza",
		tags: ["italian", "dinner"],
		image: false,
	},
	{
		title: "Miso Soup",
		description: "Comforting Japanese soup with tofu and seaweed.",
		ingredients: ["Miso paste", "Dashi", "Tofu", "Wakame", "Spring onion"],
		steps: ["Heat dashi", "Dissolve miso", "Add tofu and wakame", "Garnish with spring onion"],
		rating: 3,
		source_url: "https://www.justonecookbook.com/miso-soup",
		tags: ["soup", "asian", "vegan"],
		image: true,
	},
	{
		title: "Guacamole",
		description: "Fresh mashed avocado dip with lime.",
		ingredients: ["3 avocados", "Lime", "Onion", "Tomato", "Cilantro", "Salt"],
		steps: ["Mash avocados", "Fold in onion and tomato", "Add lime and cilantro", "Season"],
		rating: 4,
		source_url: "https://www.foodnetwork.com/recipes/guacamole",
		tags: ["mexican", "vegan", "quick"],
		image: false,
	},
	{
		title: "French Onion Soup",
		description: "Caramelised onions under melted gruyere crouton.",
		ingredients: ["4 onions", "Beef stock", "Gruyere", "Bread", "Butter", "Thyme"],
		steps: ["Caramelise onions slowly", "Add stock and simmer", "Top with bread and cheese", "Grill until bubbly"],
		rating: 5,
		source_url: "https://www.seriouseats.com/french-onion-soup",
		tags: ["soup", "dinner"],
		image: true,
	},
	{
		title: "Veggie Stir-Fry",
		description: "Fast weeknight vegetables in a garlic ginger sauce.",
		ingredients: ["Broccoli", "Bell pepper", "Carrot", "Garlic", "Ginger", "Soy sauce"],
		steps: ["Chop vegetables", "Heat wok screaming hot", "Stir-fry aromatics", "Add veg and sauce"],
		rating: 3,
		source_url: "https://minimalistbaker.com/veggie-stir-fry",
		tags: ["asian", "vegan", "quick"],
		image: false,
	},
	{
		title: "Fudgy Brownies",
		description: "Dense, rich chocolate brownies.",
		ingredients: ["200g chocolate", "150g butter", "200g sugar", "3 eggs", "100g flour"],
		steps: ["Melt chocolate and butter", "Beat in eggs and sugar", "Fold in flour", "Bake 25 minutes at 180C"],
		rating: 5,
		source_url: "https://www.bbcgoodfood.com/recipes/fudgy-brownies",
		tags: ["dessert", "baking"],
		image: true,
	},
	{
		title: "Shakshuka",
		description: "Eggs poached in spiced tomato pepper sauce.",
		ingredients: ["Eggs", "Tomatoes", "Bell pepper", "Onion", "Cumin", "Feta"],
		steps: ["Soften onion and pepper", "Add tomatoes and spices", "Simmer into a sauce", "Crack in eggs and cover"],
		rating: 4,
		source_url: "https://www.seriouseats.com/shakshuka",
		tags: ["breakfast", "dinner"],
		image: false,
	},
	{
		title: "Mushroom Risotto",
		description: "Creamy arborio rice with wild mushrooms.",
		ingredients: ["Arborio rice", "Mixed mushrooms", "Stock", "Onion", "White wine", "Parmesan"],
		steps: ["Soften onion", "Toast rice", "Add wine", "Ladle in stock gradually", "Finish with parmesan"],
		rating: 4,
		source_url: "https://www.bbcgoodfood.com/recipes/mushroom-risotto",
		tags: ["italian", "dinner"],
		image: true,
	},
	{
		title: "Vietnamese Pho",
		description: "Aromatic beef noodle soup with herbs.",
		ingredients: ["Rice noodles", "Beef stock", "Beef slices", "Star anise", "Cinnamon", "Basil"],
		steps: ["Simmer spiced broth", "Cook noodles", "Layer beef in bowls", "Pour over hot broth"],
		rating: 5,
		source_url: "https://www.seriouseats.com/vietnamese-pho",
		tags: ["soup", "asian"],
		image: false,
	},
	{
		title: "Huevos Rancheros",
		description: "Fried eggs on tortillas with ranchera sauce.",
		ingredients: ["Eggs", "Tortillas", "Tomatoes", "Onion", "Chili", "Cilantro"],
		steps: ["Make ranchera sauce", "Fry eggs", "Warm tortillas", "Assemble and top"],
		rating: 4,
		source_url: "https://www.foodnetwork.com/recipes/huevos-rancheros",
		tags: ["mexican", "breakfast"],
		image: true,
	},
	{
		title: "Lentil Curry",
		description: "Hearty spiced red lentil dal.",
		ingredients: ["Red lentils", "Onion", "Garlic", "Ginger", "Curry powder", "Tomato", "Coconut milk"],
		steps: ["Soften aromatics", "Add spices", "Simmer lentils with tomato", "Finish with coconut milk"],
		rating: 4,
		source_url: "https://minimalistbaker.com/red-lentil-curry",
		tags: ["vegan", "healthy", "dinner"],
		image: false,
	},
	{
		title: "Apple Pie",
		description: "Classic double-crust pie with cinnamon apples.",
		ingredients: ["Apples", "Pie crust", "Sugar", "Cinnamon", "Lemon", "Butter"],
		steps: ["Prepare apples with sugar and spice", "Line dish with pastry", "Fill and cover", "Bake until golden"],
		rating: 5,
		source_url: "https://www.allrecipes.com/recipe/apple-pie",
		tags: ["dessert", "baking"],
		image: true,
	},
	{
		title: "Greek Salad",
		description: "Crisp vegetables with olives and feta.",
		ingredients: ["Tomatoes", "Cucumber", "Red onion", "Olives", "Feta", "Olive oil", "Oregano"],
		steps: ["Chop vegetables", "Combine with olives", "Top with feta", "Dress with oil and oregano"],
		rating: 3,
		source_url: "https://www.bbcgoodfood.com/recipes/greek-salad",
		tags: ["healthy", "quick", "vegan"],
		image: false,
	},
];

let withImage = 0;
let withoutImage = 0;
const now = Date.now();

data.forEach((seed, i) => {
	const id = recipes.insert({
		title: seed.title,
		description: seed.description,
		ingredients: seed.ingredients,
		steps: seed.steps,
		rating: seed.rating,
		source_url: seed.source_url,
		image_filename: seed.image ? IMAGES[i % IMAGES.length] : null,
	});
	tags.replaceForRecipe(id, seed.tags);
	if (seed.image) withImage++;
	else withoutImage++;

	// spread created_at so date sorting is visible (newest first)
	const d = new Date(now - i * 24 * 60 * 60 * 1000);
	const pad = (n: number) => String(n).padStart(2, "0");
	const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
		d.getMinutes(),
	)}:${pad(d.getSeconds())}`;
	db.prepare("UPDATE recipes SET created_at = ? WHERE id = ?").run(iso, id);
});

db.close();

console.log(`Seeded ${data.length} recipes (${withImage} with image, ${withoutImage} without image) into ${dataDir}/recipes.db`);
