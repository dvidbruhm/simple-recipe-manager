const BROWSER_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

export interface FetchResult {
	status: number;
	html: string;
	finalUrl: string;
}

export async function fetchHtml(url: string): Promise<FetchResult | null> {
	try {
		const res = await fetch(url, {
			headers: BROWSER_HEADERS,
			redirect: "follow",
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return null;
		const text = await res.text();
		if (text.length > 5_000_000) return null;
		return { status: res.status, html: text, finalUrl: res.url };
	} catch {
		return null;
	}
}
