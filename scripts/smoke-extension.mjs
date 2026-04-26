import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

try {
  const distDir = path.join(process.cwd(), "dist");
  const manifestPath = path.join(distDir, "manifest.json");
  const contentPath = path.join(distDir, "content.js");
  const backgroundPath = path.join(distDir, "background.js");

  assert(fs.existsSync(manifestPath), "dist/manifest.json is missing");
  assert(fs.existsSync(contentPath), "dist/content.js is missing");
  assert(fs.existsSync(backgroundPath), "dist/background.js is missing");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const serializedManifest = JSON.stringify(manifest);
  const firstContentScript = manifest.content_scripts?.[0];

  assert(manifest.manifest_version === 3, "manifest_version must be 3");
  assert(manifest.name === "WatchDeck", "manifest name must be WatchDeck");
  assertDeepEqual(manifest.permissions, ["storage"], "permissions must be exactly storage");
  assert(manifest.host_permissions === undefined, "host_permissions must be absent");
  assert(!serializedManifest.includes("<all_urls>"), "manifest must not include <all_urls>");
  assertDeepEqual(firstContentScript?.matches, ["https://www.youtube.com/*"], "content script must only target YouTube");

  console.log("watchdeck smoke passed");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`watchdeck smoke failed: ${message}`);
  process.exit(1);
}
