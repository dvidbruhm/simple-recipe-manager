const BROWSER_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

const MAX_HTML_BYTES = 5_000_000;

export interface FetchResult {
	status: number;
	html: string;
	finalUrl: string;
}

async function directFetch(url: string): Promise<FetchResult | null> {
	try {
		const res = await fetch(url, {
			headers: BROWSER_HEADERS,
			redirect: "follow",
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return null;
		const text = await res.text();
		if (text.length > MAX_HTML_BYTES) return null;
		return { status: res.status, html: text, finalUrl: res.url };
	} catch {
		return null;
	}
}

function buildProxyUrl(template: string, target: string): string | null {
	if (!template) return null;
	if (template.includes("{urlEncoded}")) {
		return template.replace("{urlEncoded}", encodeURIComponent(target));
	}
	if (template.includes("{url}")) {
		return template.replace("{url}", target);
	}
	return null;
}

async function proxyFetch(template: string, url: string): Promise<FetchResult | null> {
	const proxyUrl = buildProxyUrl(template, url);
	if (!proxyUrl) return null;
	try {
		const res = await fetch(proxyUrl, {
			headers: { ...BROWSER_HEADERS, "X-Return-Format": "html" },
			redirect: "follow",
			signal: AbortSignal.timeout(45_000),
		});
		if (!res.ok) return null;
		const text = await res.text();
		if (!text || text.length > MAX_HTML_BYTES) return null;
		// Keep the original URL as finalUrl so extraction resolves against the real site.
		return { status: res.status, html: text, finalUrl: url };
	} catch {
		return null;
	}
}

/**
 * Fetch a page's HTML. Tries a direct request first; if that is blocked or fails
 * and a proxy template is configured, retries through the proxy (e.g. a reader
 * service). The proxy template may contain `{url}` (raw) or `{urlEncoded}`.
 */
export async function fetchHtml(url: string, proxyTemplate = ""): Promise<FetchResult | null> {
	const direct = await directFetch(url);
	if (direct) return direct;
	if (proxyTemplate) return proxyFetch(proxyTemplate, url);
	return null;
}
