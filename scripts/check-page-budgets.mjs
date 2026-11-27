#!/usr/bin/env node
/**
 * Tasks S3 and U4: after `next build`, checks every page's JavaScript
 * against its size budget and against 2 seconds on a slow mobile connection
 * (config/performance-budget.json). Exits 1 when a page is over, so the CI
 * check on every change fails.
 *
 * Usage: node scripts/check-page-budgets.mjs [--report]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const next = join(root, ".next");
if (!existsSync(join(next, "build-manifest.json"))) {
  console.error("Run `next build` first: .next/build-manifest.json is missing.");
  process.exit(2);
}
const budget = JSON.parse(readFileSync(join(root, "config/performance-budget.json"), "utf8"));
const build = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8"));

const sizes = new Map();
const gz = (file) => {
  if (!sizes.has(file)) {
    const path = join(next, file);
    sizes.set(file, existsSync(path) ? gzipSync(readFileSync(path)).length : 0);
  }
  return sizes.get(file);
};

const chunksDir = join(next, "static", "chunks");
const sharedById = new Map();
for (const name of readdirSync(chunksDir)) {
  const match = name.match(/^(\d+)-[0-9a-f]+\.js$/);
  if (match) sharedById.set(match[1], `static/chunks/${name}`);
}
/** The chunks an entry chunk loads before it runs (webpack's `e.O(0,[...])`). */
function dependencies(file) {
  const text = readFileSync(join(next, file), "utf8");
  const ids = [...text.matchAll(/\.O\(0,\[([\d,]+)\]/g)].flatMap((match) => match[1].split(","));
  return ids.map((id) => sharedById.get(id)).filter(Boolean);
}
const fileIn = (dir, prefix) => {
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find((item) => item.startsWith(prefix) && item.endsWith(".js"));
  return name ? relative(next, join(dir, name)).split(sep).join("/") : null;
};

/** Every route: the folders under static/chunks/app that have a page chunk. */
function pages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...pages(path));
    else if (/^page-[0-9a-f]+\.js$/.test(name)) out.push(dir);
  }
  return out;
}

const { slowMobile } = budget;
const appChunks = join(chunksDir, "app");
const rows = [];
for (const dir of pages(appChunks)) {
  const route = relative(appChunks, dir).split(sep).join("/") || "/";
  if (route.startsWith("api")) continue;
  const entries = [...build.rootMainFiles];
  // The root layout and each folder's layout on the way down, then the page.
  const segments = route === "/" ? [] : route.split("/");
  for (let depth = 0; depth <= segments.length; depth += 1) {
    const layout = fileIn(join(appChunks, ...segments.slice(0, depth)), "layout-");
    if (layout) entries.push(layout);
  }
  entries.push(fileIn(dir, "page-"));
  const chunks = new Set(entries.filter(Boolean));
  for (const entry of [...chunks]) for (const dependency of dependencies(entry)) chunks.add(dependency);
  const bytes = [...chunks].reduce((sum, chunk) => sum + gz(chunk), 0);
  const kb = Math.round(bytes / 1024);
  const seconds = (slowMobile.roundTrips * slowMobile.roundTripMs) / 1000 + bytes / slowMobile.bytesPerSecond;
  const limitKb = budget.routesKb[route] ?? budget.defaultKb;
  rows.push({ route, kb, limitKb, seconds, over: kb > limitKb || seconds > slowMobile.maxSeconds });
}

rows.sort((a, b) => b.kb - a.kb);
const report = process.argv.includes("--report");
for (const row of rows) {
  if (report || row.over) {
    console.log(`${row.over ? "OVER" : "ok  "}  ${row.route.padEnd(48)} ${String(row.kb).padStart(4)} KB of ${row.limitKb} KB, ${row.seconds.toFixed(2)} s on slow mobile`);
  }
}
const over = rows.filter((row) => row.over);
console.log(`${rows.length} pages checked; ${over.length} over budget. Heaviest: ${rows[0]?.route} at ${rows[0]?.kb} KB.`);
process.exit(over.length ? 1 : 0);
