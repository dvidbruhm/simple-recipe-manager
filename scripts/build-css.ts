import { $ } from "bun";

await $`bun x @tailwindcss/cli -i src/ui/css/app.tailwind.css -o src/ui/static/app.css --minify`;