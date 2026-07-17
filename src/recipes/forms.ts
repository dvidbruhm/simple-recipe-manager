export interface RecipeInput {
	title?: string;
	description?: string;
	ingredients?: string[];
	steps?: string[];
	notes?: string;
	source_url?: string;
	image_filename?: string | null;
	rating?: number;
	favorite?: boolean;
}

export type ValidationResult =
	| { valid: true; data: RecipeInput }
	| { valid: false; errors: string[] };

export function validateRecipe(input: RecipeInput): ValidationResult {
	const errors: string[] = [];
	if (!input.title || input.title.trim() === "") errors.push("title is required");
	const rating = input.rating ?? 0;
	if (typeof rating !== "number" || rating < 0 || rating > 5 || !Number.isInteger(rating)) {
		errors.push("rating must be an integer 0-5");
	}
	if (errors.length > 0) return { valid: false, errors };
	return { valid: true, data: input };
}
