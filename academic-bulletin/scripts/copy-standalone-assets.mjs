import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("\n📦 [Standalone Assets] Checking Next.js standalone build...");

const standaloneDir = path.join(projectRoot, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.warn("⚠️  .next/standalone directory was not found. Skipping static asset copying.");
  console.warn("   (Ensure `output: 'standalone'` is configured in next.config.ts if you expect a standalone build.)\n");
  process.exit(0);
}

function copyDirectory(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory "${label}" (${src}) does not exist. Skipping.`);
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`✅ Copied ${label} -> ${path.relative(projectRoot, dest)}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to copy ${label}:`, err.message);
    return false;
  }
}

function copyFile(src, dest, label) {
  if (!fs.existsSync(src)) {
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied ${label} -> ${path.relative(projectRoot, dest)}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to copy ${label}:`, err.message);
    return false;
  }
}

// 1. Copy .next/static -> .next/standalone/.next/static
const nextStaticSrc = path.join(projectRoot, ".next", "static");
const nextStaticDest = path.join(standaloneDir, ".next", "static");
copyDirectory(nextStaticSrc, nextStaticDest, ".next/static");

// 2. Copy public -> .next/standalone/public
const publicSrc = path.join(projectRoot, "public");
const publicDest = path.join(standaloneDir, "public");
copyDirectory(publicSrc, publicDest, "public");

// 3. Copy .env files (local or parent project .env) if present
const localEnvSrc = path.join(projectRoot, ".env");
const parentEnvSrc = path.resolve(projectRoot, "..", ".env");
const envDest = path.join(standaloneDir, ".env");

if (fs.existsSync(localEnvSrc)) {
  copyFile(localEnvSrc, envDest, ".env");
} else if (fs.existsSync(parentEnvSrc)) {
  copyFile(parentEnvSrc, envDest, "../.env");
}

console.log("✨ [Standalone Assets] Static files and assets synchronized successfully!\n");

