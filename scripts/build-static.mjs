import { cp, mkdir, rm } from "node:fs/promises";
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

  if (!existsSync(src)) {
    throw new Error(`Missing static file: ${file}`);
  }

  await cp(src, resolve(dist, file));
}

const icons = [
  "icon-152.png",
  "icon-167.png",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png"
];

for (const icon of icons) {
  const src = resolve(root, icon);

  if (existsSync(src)) {
    await cp(src, resolve(dist, icon));
  }
}

if (existsSync(resolve(root, "icons"))) {
  await cp(
    resolve(root, "icons"),
    resolve(dist, "icons"),
    { recursive: true }
  );
}

console.log("Ava I static frontend built into dist/");
