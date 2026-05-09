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
    const repository = createLocalStorageRepository({ now: () => 3500 });

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
    const repository = createLocalStorageRepository({ now: () => 2000 });
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

  it("prunes older records beyond maxRecords while keeping non-resume keys", async () => {
    const { values } = installChromeStorage({ unrelated: { keep: true } });
    const repository = createLocalStorageRepository({ now: () => 3500 });

    await repository.saveResumeRecord({ videoId: "oldest1", timestampSeconds: 10, durationSeconds: 100, updatedAtMs: 1000 });
    await repository.saveResumeRecord({ videoId: "newest2", timestampSeconds: 20, durationSeconds: 100, updatedAtMs: 3000 });
    await repository.saveResumeRecord({ videoId: "middle3", timestampSeconds: 30, durationSeconds: 100, updatedAtMs: 2000 });

    await expect(repository.pruneResumeRecords({ maxRecords: 2 })).resolves.toEqual({ pruned: 1, remaining: 2 });

    expect(values["watchdeck:resume:v1:oldest1"]).toBeUndefined();
    expect(values["watchdeck:resume:v1:newest2"]).toBeDefined();
    expect(values["watchdeck:resume:v1:middle3"]).toBeDefined();
    expect(values.unrelated).toEqual({ keep: true });
  });

  it("prunes records older than maxAgeMs", async () => {
    const { values } = installChromeStorage();
    const repository = createLocalStorageRepository({ now: () => 5000 });

    await repository.saveResumeRecord({ videoId: "stale1", timestampSeconds: 10, durationSeconds: 100, updatedAtMs: 3999 });
    await repository.saveResumeRecord({ videoId: "fresh2", timestampSeconds: 20, durationSeconds: 100, updatedAtMs: 4000 });

    await expect(repository.pruneResumeRecords({ maxAgeMs: 1000 })).resolves.toEqual({ pruned: 1, remaining: 1 });

    expect(values["watchdeck:resume:v1:stale1"]).toBeUndefined();
    expect(values["watchdeck:resume:v1:fresh2"]).toBeDefined();
  });

  it("removes malformed resume-prefixed values and counts them as pruned", async () => {
    const { values } = installChromeStorage({
      "watchdeck:resume:v1:badbad": { schemaVersion: 2, videoId: "badbad" }
    });
    const repository = createLocalStorageRepository({ now: () => 2000 });

    await repository.saveResumeRecord({ videoId: "valid1", timestampSeconds: 20, durationSeconds: 100, updatedAtMs: 1000 });

    await expect(repository.pruneResumeRecords()).resolves.toEqual({ pruned: 1, remaining: 1 });

    expect(values["watchdeck:resume:v1:badbad"]).toBeUndefined();
    expect(values["watchdeck:resume:v1:valid1"]).toBeDefined();
  });

  it("warns and returns a safe pruning result when remove fails", async () => {
    installChromeStorage();
    const logger = { warn: vi.fn() };
    const repository = createLocalStorageRepository({ logger });

    await repository.saveResumeRecord({ videoId: "oldest1", timestampSeconds: 10, durationSeconds: 100, updatedAtMs: 1000 });
    await repository.saveResumeRecord({ videoId: "newest2", timestampSeconds: 20, durationSeconds: 100, updatedAtMs: 3000 });
    vi.spyOn(chrome.storage.local, "remove").mockRejectedValueOnce(new Error("remove failed"));

    await expect(repository.pruneResumeRecords({ maxRecords: 1 })).resolves.toEqual({ pruned: 0, remaining: 2 });

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("clears all resume records while preserving unrelated storage", async () => {
    const { values } = installChromeStorage({
      unrelated: { keep: true },
      "watchdeck:settings:v1": { resumeEnabled: true, debugLogging: false },
      "watchdeck:resume:v1:abc123": { value: 1 },
      "watchdeck:resume:v1:def456": { value: 2 }
    });
    const repository = createLocalStorageRepository();

    await expect(repository.clearResumeRecords()).resolves.toBe(2);

    expect(values["watchdeck:resume:v1:abc123"]).toBeUndefined();
    expect(values["watchdeck:resume:v1:def456"]).toBeUndefined();
    expect(values.unrelated).toEqual({ keep: true });
    expect(values["watchdeck:settings:v1"]).toEqual({ resumeEnabled: true, debugLogging: false });
  });

  it("returns zero when clearing finds no resume records or storage is unavailable", async () => {
    installChromeStorage({ unrelated: true });
    await expect(createLocalStorageRepository().clearResumeRecords()).resolves.toBe(0);

    vi.unstubAllGlobals();
    await expect(createLocalStorageRepository().clearResumeRecords()).resolves.toBe(0);
  });

  it("warns and returns zero when clearing resume records fails", async () => {
    installChromeStorage({ [storageKey]: { value: 1 } });
    const logger = { warn: vi.fn() };
    const repository = createLocalStorageRepository({ logger });

    vi.spyOn(chrome.storage.local, "remove").mockRejectedValueOnce(new Error("remove failed"));

    await expect(repository.clearResumeRecords()).resolves.toBe(0);
    expect(logger.warn).toHaveBeenCalledWith("watchdeck failed to clear resume records", expect.any(Error));
  });

  it("isAvailable, listResumeRecords, and deleteResumeRecord behave correctly with and without chrome.storage", async () => {
    const { values } = installChromeStorage({ unrelated: { keep: true } });
    const repository = createLocalStorageRepository({ now: () => 5000 });

    // isAvailable: true when chrome.storage.local is present.
    expect(repository.areaName).toBe("local");
    expect(repository.isAvailable()).toBe(true);

    // listResumeRecords: empty when no resume keys exist (despite unrelated keys present).
    await expect(repository.listResumeRecords()).resolves.toEqual([]);

    // listResumeRecords: returns only valid resume records and ignores unrelated keys.
    const savedA = await repository.saveResumeRecord({ videoId: "abc123", timestampSeconds: 10, durationSeconds: 100, updatedAtMs: 1000 });
    const savedB = await repository.saveResumeRecord({ videoId: "def456", timestampSeconds: 20, durationSeconds: 100, updatedAtMs: 2000 });
    const listed = await repository.listResumeRecords();
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([savedA, savedB]));

    // deleteResumeRecord: removes the requested key and leaves siblings + unrelated values intact.
    await repository.deleteResumeRecord("abc123");
    expect(values["watchdeck:resume:v1:abc123"]).toBeUndefined();
    expect(values["watchdeck:resume:v1:def456"]).toBeDefined();
    expect(values.unrelated).toEqual({ keep: true });

    // deleteResumeRecord: invalid video ID is a no-op (does not touch unrelated storage).
    await repository.deleteResumeRecord("bad");
    expect(values["watchdeck:resume:v1:def456"]).toBeDefined();
    expect(values.unrelated).toEqual({ keep: true });

    // listResumeRecords: returns empty when storage is unavailable.
    vi.unstubAllGlobals();
    const unavailableRepository = createLocalStorageRepository();
    expect(unavailableRepository.isAvailable()).toBe(false);
    await expect(unavailableRepository.listResumeRecords()).resolves.toEqual([]);
    // deleteResumeRecord: no throw when storage is unavailable.
    await expect(unavailableRepository.deleteResumeRecord("abc123")).resolves.toBeUndefined();
  });
});
