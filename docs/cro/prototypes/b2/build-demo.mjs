// Bundles the real Pekko menu renderer for the prototype's live demo. Uses the esbuild already installed for tests.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, "src/demo-entry.ts")],
  outfile: join(here, "assets/demo.js"),
  bundle: true, minify: true, format: "iife", target: ["es2019"], legalComments: "none",
  tsconfig: join(here, "../../../../tsconfig.json"),
});
