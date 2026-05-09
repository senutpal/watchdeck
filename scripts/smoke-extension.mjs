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
  const popupHtmlPath = path.join(distDir, "popup.html");
  const popupJsPath = path.join(distDir, "popup.js");

  assert(fs.existsSync(manifestPath), "dist/manifest.json is missing");
  assert(fs.existsSync(contentPath), "dist/content.js is missing");
  assert(fs.existsSync(backgroundPath), "dist/background.js is missing");
  assert(fs.existsSync(popupHtmlPath), "dist/popup.html is missing");
  assert(fs.existsSync(popupJsPath), "dist/popup.js is missing");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const serializedManifest = JSON.stringify(manifest);
  const firstContentScript = manifest.content_scripts?.[0];

  assert(manifest.manifest_version === 3, "manifest_version must be 3");
  assert(manifest.name === "WatchDeck", "manifest name must be WatchDeck");
  assertDeepEqual(manifest.permissions, ["storage", "activeTab"], "permissions must be exactly storage + activeTab");
  assert(manifest.host_permissions === undefined, "host_permissions must be absent");
  assert(!serializedManifest.includes("<all_urls>"), "manifest must not include <all_urls>");
  assertDeepEqual(firstContentScript?.matches, ["https://www.youtube.com/*"], "content script must only target YouTube");
  assert(manifest.action?.default_popup === "popup.html", "action.default_popup must point to popup.html");
  assert(manifest.action?.default_title === "WatchDeck", "action.default_title must be 'WatchDeck'");
  assert(!serializedManifest.includes(" v1 "), "user-facing manifest copy must not mention v1");

  const requiredIconSizes = ["16", "32", "48", "128"];
  assert(manifest.icons && typeof manifest.icons === "object", "manifest.icons block is required for Chrome Web Store");
  for (const size of requiredIconSizes) {
    const iconPath = manifest.icons[size];
    assert(typeof iconPath === "string" && iconPath.length > 0, `manifest.icons["${size}"] is required`);
    const resolved = path.join(distDir, iconPath);
    assert(fs.existsSync(resolved), `bundled icon missing: ${iconPath}`);
    const stat = fs.statSync(resolved);
    assert(stat.size > 0, `bundled icon is empty: ${iconPath}`);
  }

  const popupHtml = fs.readFileSync(popupHtmlPath, "utf8");
  assert(popupHtml.includes('src="popup.js"'), "popup.html must reference popup.js");
  assert(popupHtml.includes("WatchDeck"), "popup.html must show WatchDeck branding");
  assert(!popupHtml.includes(" v1 "), "popup.html must not mention v1");

  console.log("watchdeck smoke passed");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`watchdeck smoke failed: ${message}`);
  process.exit(1);
}
