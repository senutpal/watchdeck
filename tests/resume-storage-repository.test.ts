import { createLocalStorageRepository } from "../src/storage/local-storage-repository";

type StoredValues = Record<string, unknown>;

function installChromeStorage(initialValues: StoredValues = {}) {
  const values: StoredValues = { ...initialValues };
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
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete values[key];
      }
    }
  };

  vi.stubGlobal("chrome", { storage: { local } });

  return { values, local };
}

describe("local resume storage repository", () => {
  const videoId = "dQw4w9WgXcQ";
  const storageKey = `watchdeck:resume:v1:${videoId}`;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saves rounded per-video resume records under the expected storage key", async () => {
    const { values } = installChromeStorage();
    const repository = createLocalStorageRepository();

    const saved = await repository.saveResumeRecord({
      videoId,
      timestampSeconds: 42.8,
      durationSeconds: 300.2,
      updatedAtMs: 1000
    });

    expect(saved).toEqual({
      schemaVersion: 1,
      videoId,
      timestampSeconds: 43,
      durationSeconds: 300,
      updatedAtMs: 1000,
      completed: false
    });
    expect(values[storageKey]).toEqual(saved);
  });

  it("retrieves saved records and returns null for missing videos", async () => {
    installChromeStorage();
    const repository = createLocalStorageRepository();
    const saved = await repository.saveResumeRecord({
      videoId,
      timestampSeconds: 42.8,
      durationSeconds: 300.2,
      updatedAtMs: 1000
    });

    await expect(repository.getResumeRecord(videoId)).resolves.toEqual(saved);
    await expect(repository.getResumeRecord("missing")).resolves.toBeNull();
  });

  it("stores exactly the minimal resume schema", async () => {
    installChromeStorage();
    const repository = createLocalStorageRepository();

    const saved = await repository.saveResumeRecord({
      videoId,
      timestampSeconds: 42.8,
      durationSeconds: 300.2,
      updatedAtMs: 1000
    });

    expect(Object.keys(saved ?? {}).sort()).toEqual([
      "completed",
      "durationSeconds",
      "schemaVersion",
      "timestampSeconds",
      "updatedAtMs",
      "videoId"
    ].sort());
  });

  it("warns and returns safe fallbacks when read or save fails", async () => {
    installChromeStorage();
    const logger = { warn: vi.fn() };
    const repository = createLocalStorageRepository({ logger });
    const local = chrome.storage.local;

    vi.spyOn(local, "set").mockRejectedValueOnce(new Error("set failed"));
    await expect(repository.saveResumeRecord({
      videoId,
      timestampSeconds: 42.8,
      durationSeconds: 300.2,
      updatedAtMs: 1000
    })).resolves.toBeNull();

    vi.spyOn(local, "get").mockRejectedValueOnce(new Error("get failed"));
    await expect(repository.getResumeRecord(videoId)).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
