import { DEFAULT_SETTINGS } from "../src/settings/default-settings";
import { createSettingsRepository } from "../src/settings/settings-repository";

type StoredValues = Record<string, unknown>;

function installChromeStorage(initialValues: StoredValues = {}) {
  const values: StoredValues = { ...initialValues };
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();
  const local = {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (typeof keys === "string") {
        return { [keys]: values[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, values[key]]));
      }

      if (keys && typeof keys === "object") {
        return Object.fromEntries(Object.keys(keys).map((key) => [key, values[key] ?? keys[key]]));
      }

      return { ...values };
    },
    async set(items: StoredValues) {
      Object.assign(values, items);
    }
  };
  const onChanged = {
    addListener(listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) {
      listeners.add(listener);
    },
    removeListener(listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) {
      listeners.delete(listener);
    }
  };

  vi.stubGlobal("chrome", { storage: { local, onChanged } });

  return { values, local, listeners };
}

describe("settings repository", () => {
  const settingsKey = "watchdeck:settings:v1";

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns default settings when nothing is stored", async () => {
    installChromeStorage();
    const repository = createSettingsRepository();

    await expect(repository.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("stores resume enablement locally while preserving debug logging", async () => {
    const { values } = installChromeStorage({
      [settingsKey]: { resumeEnabled: true, debugLogging: false }
    });
    const repository = createSettingsRepository();

    await expect(repository.setResumeEnabled(false)).resolves.toEqual({
      resumeEnabled: false,
      debugLogging: false
    });

    expect(values[settingsKey]).toEqual({ resumeEnabled: false, debugLogging: false });
  });

  it("falls back to defaults and warns for malformed values or storage failures", async () => {
    installChromeStorage({ [settingsKey]: { resumeEnabled: "yes", debugLogging: false } });
    const logger = { warn: vi.fn() };
    const repository = createSettingsRepository({ logger });

    await expect(repository.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);

    vi.spyOn(chrome.storage.local, "get").mockRejectedValueOnce(new Error("get failed"));
    await expect(repository.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);

    vi.spyOn(chrome.storage.local, "set").mockRejectedValueOnce(new Error("set failed"));
    await expect(repository.setResumeEnabled(false)).resolves.toEqual(DEFAULT_SETTINGS);

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("watches local settings changes and removes the listener on cleanup", () => {
    const { listeners } = installChromeStorage();
    const repository = createSettingsRepository();
    const onSettings = vi.fn();

    const cleanup = repository.watchSettings(onSettings);
    const listener = Array.from(listeners)[0];

    listener({ unrelated: { newValue: true } }, "local");
    listener({ [settingsKey]: { newValue: { resumeEnabled: false, debugLogging: false } } }, "sync");
    listener({ [settingsKey]: { newValue: { resumeEnabled: false, debugLogging: false } } }, "local");

    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledWith({ resumeEnabled: false, debugLogging: false });

    cleanup();
    expect(listeners.size).toBe(0);
  });
});
