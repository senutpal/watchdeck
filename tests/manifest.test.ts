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

  it("requests only local storage permission", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("does not include broad or unrelated permissions", () => {
    expect(serializedManifest).not.toContain("<all_urls>");
    expect(serializedManifest).not.toContain("activeTab");
    expect(serializedManifest).not.toContain("scripting");
    expect(serializedManifest).not.toContain("tabs");
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
