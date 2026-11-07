import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), ".next", "server");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".nft.json")) out.push(full);
  }
  return out;
}

const manifests = walk(root).filter((file) =>
  file.includes(`${path.sep}api${path.sep}media${path.sep}presentation${path.sep}complete${path.sep}`),
);

if (!manifests.length) {
  console.error("No .nft.json for /api/media/presentation/complete under .next/server");
  process.exit(1);
}

const required = [
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  "canvas-linux-x64-gnu",
];
const problems = [];

for (const manifest of manifests) {
  const json = JSON.parse(readFileSync(manifest, "utf8"));
  const files = Array.isArray(json.files) ? json.files.map(String) : [];
  for (const needle of required) {
    const match = files.find((entry) => entry.includes(needle));
    if (!match) {
      problems.push(`${path.relative(process.cwd(), manifest)} does not trace ${needle}`);
      continue;
    }
    const absolute = path.resolve(path.dirname(manifest), match);
    if (!existsSync(absolute)) {
      problems.push(`${needle} is listed but missing on disk: ${absolute}`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`pdf conversion trace ok (${manifests.length} manifest${manifests.length === 1 ? "" : "s"})`);
