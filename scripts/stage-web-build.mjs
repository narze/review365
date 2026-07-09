#!/usr/bin/env node
/**
 * Stage the SvelteKit static build to ./build for Vercel.
 * Bun/Vercel may leave output in apps/web/build or already at ./build
 * depending on cwd — never delete the source before we know where it is.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const candidates = ["apps/web/build", "build"];

function hasIndex(dir) {
  return fs.existsSync(path.join(ROOT, dir, "index.html"));
}

const src = candidates.find(hasIndex);
if (!src) {
  console.error("No web build output found. Looked for index.html in:");
  for (const dir of candidates) {
    console.error(`  - ${path.join(ROOT, dir)}`);
  }
  process.exit(1);
}

if (src === "build") {
  console.log("Static site already at ./build");
  process.exit(0);
}

const dest = path.join(ROOT, "build");
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, src), dest, { recursive: true });
console.log(`Staged ${src} → build`);
