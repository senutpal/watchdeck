import fs from "node:fs";
import path from "node:path";

describe("extension manifest", () => {
  const manifestPath = path.join(process.cwd(), "public", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const serializedManifest = JSON.stringify(manifest);
  const firstContentScript = manifest.content_scripts?.[0];

  it("uses Manifest V3 and the WatchDeck extension name", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("WatchDeck");
  });

  it("requests only the narrow permissions WatchDeck needs", () => {
    // storage: per-video resume timestamps in chrome.storage.local
    // activeTab: when the user clicks the toolbar icon, read the active tab's URL
    //            so the popup can target "Clear this video" at the right videoId.
    //            activeTab is granted only on user gesture and revoked on tab change,
    //            so it does not require persistent host access.
    expect(manifest.permissions).toEqual(["storage", "activeTab"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("does not include broad or unrelated permissions", () => {
    expect(serializedManifest).not.toContain("<all_urls>");
    expect(serializedManifest).not.toContain("scripting");
    // The "tabs" permission grants persistent tab access across the browser; we use
    // "activeTab" instead, which is event-scoped to the user clicking the action.
    expect(manifest.permissions).not.toContain("tabs");
  });

  it("targets only YouTube with the expected content script", () => {
    expect(firstContentScript.matches).toEqual(["https://www.youtube.com/*"]);
    expect(firstContentScript.js).toEqual(["content.js"]);
    expect(firstContentScript.run_at).toBe("document_idle");
  });

  it("uses the expected background service worker", () => {
    expect(manifest.background.service_worker).toBe("background.js");
  });
});
