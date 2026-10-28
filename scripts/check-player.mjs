// Fails if the TV player script uses anything newer than ES5 syntax.
import { readFileSync } from "node:fs";
import { parse } from "acorn";
const html = readFileSync(new URL("../public/player.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
parse(js, { ecmaVersion: 5 });
console.log("player.html script parses as ES5 ✓");
