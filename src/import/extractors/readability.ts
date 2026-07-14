import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface ReadabilityResult {
	title: string;
	excerpt: string;
	text: string;
	image: string | null;
}

export function tryReadability(html: string): ReadabilityResult | null {
	try {
		const { document } = parseHTML(html);
		const reader = new Readability(document as unknown as Document);
		const article = reader.parse();
		if (!article) return null;
		const ogImage =
			document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
		return {
			title: article.title ?? "",
			excerpt: article.excerpt ?? "",
			text: article.textContent ?? "",
			image: ogImage,
		};
	} catch {
		return null;
	}
}
