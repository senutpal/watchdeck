import fs from "node:fs";
import path from "node:path";
import { createExtensionContext } from "../src/core/extension-context";
import { createFeatureRegistry } from "../src/core/feature-registry";
import { createResumeFeature } from "../src/features/resume";
import { createExampleNoopFeature } from "../src/features/example-noop";
import type { LocalStorageRepository } from "../src/storage/local-storage-repository";
import type { SettingsRepository } from "../src/settings/settings-repository";
import type { WatchdeckSettings } from "../src/settings/default-settings";
import type { ResumeTrustPanel } from "../src/features/resume/trust-panel";
import type { YoutubeAdapter } from "../src/adapters/youtube";

// ── inline helpers (copied from tests/resume-feature-runtime.test.ts:38-91, see PATTERNS.md "Inline factory helpers") ──

function createRepositoryStub(overrides: Partial<LocalStorageRepository> = {}): LocalStorageRepository {
  return {
    areaName: "local",
    isAvailable: vi.fn(() => true),
    getResumeRecord: vi.fn(() => Promise.resolve(null)),
    saveResumeRecord: vi.fn(() => Promise.resolve(null)),
    deleteResumeRecord: vi.fn(() => Promise.resolve()),
    clearResumeRecords: vi.fn(() => Promise.resolve(0)),
    listResumeRecords: vi.fn(() => Promise.resolve([])),
    pruneResumeRecords: vi.fn(() => Promise.resolve({ pruned: 0, remaining: 0 })),
    ...overrides
  };
}

function createSettingsRepositoryStub(
  initialSettings: WatchdeckSettings = { resumeEnabled: true, debugLogging: false }
): SettingsRepository {
  return {
    getSettings: vi.fn(() => Promise.resolve(initialSettings)),
    setResumeEnabled: vi.fn((resumeEnabled: boolean) => Promise.resolve({ ...initialSettings, resumeEnabled })),
    watchSettings: vi.fn(() => vi.fn())
  };
}

function createTrustPanelStub(): ResumeTrustPanel {
  return {
    setCurrentVideoId: vi.fn(),
    setResumeEnabled: vi.fn(),
    showStatus: vi.fn(),
    showAutoResumed: vi.fn(),
    cleanup: vi.fn()
  };
}

// Mirrors `drainAsyncWork` in tests/resume-feature-runtime.test.ts:87-91. Three
// `await Promise.resolve()` ticks are sufficient to flush the settings-load
// promise chain in createResumeFeature.mount (src/features/resume/index.ts:160-167):
// tick 1 resolves `getSettings()`, tick 2 runs `.then(applySettings)`, tick 3
// runs any inner microtasks queued by `applySettings`. After this drain, no
// async work spawned by mount is still pending when unmount runs.
async function drainAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, acc);
    } else if (entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("feature modularity (VAL-04)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no source file outside src/features/resume/ imports resume internals", () => {
    const root = path.join(process.cwd(), "src");
    const resumeFolder = path.join(root, "features", "resume") + path.sep;
    const files = listSourceFiles(root).filter((f) => !f.startsWith(resumeFolder));

    const violations: string[] = [];
    const importRegex = /from\s+["']([^"']+)["']/g;

    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(src)) !== null) {
        const spec = match[1];
        // Disallowed: any path that reaches deeper than the resume barrel.
        // Allowed examples: "../features/resume", "./features/resume".
        // Disallowed examples: "../features/resume/progress-tracker", "../features/resume/index".
        if (/(\.\.\/|\.\/)features\/resume\/[^"']+/.test(spec)) {
          violations.push(`${path.relative(process.cwd(), file)}: ${spec}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("a new feature can be added to the registry without editing resume internals", async () => {
    const registry = createFeatureRegistry();

    const adapterCleanup = vi.fn();
    registry.register(
      createResumeFeature({
        createAdapter: () => ({
          status: "idle",
          start: () => adapterCleanup
        } as unknown as YoutubeAdapter),
        createRepository: () => createRepositoryStub(),
        createSettingsRepository: () => createSettingsRepositoryStub(),
        createTrustPanel: () => createTrustPanelStub()
      })
    );

    registry.register({ ...createExampleNoopFeature(), enabledByDefault: true });

    await registry.mountAll(createExtensionContext());
    // REQUIRED: drain the un-awaited settings-load promise chain in
    // createResumeFeature.mount (src/features/resume/index.ts:160-167) before
    // unmountAll(). The cleanedUp guard at line 148 keeps things safe without
    // the drain, but draining makes the test deterministic and removes any
    // chance of an unhandled-rejection warning leaking across tests.
    await drainAsyncWork();
    await registry.unmountAll();

    const ids = registry.list().map((f) => f.id);
    expect(ids).toContain("resume");
    expect(ids).toContain("example-noop");
  });
});
