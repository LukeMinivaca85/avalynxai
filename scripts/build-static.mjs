import { cp, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const dist = resolve("dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const staticFiles = [
  "index.html",
  "app.js",
  "styles.css",
  "sw.js",
  "manifest.webmanifest"
];

for (const file of staticFiles) {
  const src = resolve(root, file);
  if (!existsSync(src)) throw new Error(`Missing static file: ${file}`);
  await cp(src, resolve(dist, file));
}

if (existsSync(resolve(root, "icons"))) {
  await cp(resolve(root, "icons"), resolve(dist, "icons"), { recursive: true });
}

console.log("Ava I static frontend built into dist/");
