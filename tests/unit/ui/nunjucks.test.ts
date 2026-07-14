import { render } from "@/ui/nunjucks";

describe("nunjucks", () => {
	it("renders a template with a variable", () => {
		const out = render("base.html", { title: "Test", body_content: "<p>hi</p>" });
		expect(out).toContain("Test");
		expect(out).toContain("<p>hi</p>");
	});

	it("login.html renders a form", () => {
		const out = render("login.html", { return_to: "/recipes" });
		expect(out).toContain("form");
		expect(out).toContain('action="/login"');
		expect(out).toContain("password");
	});
});
