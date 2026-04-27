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

  it("prunes older records beyond maxRecords while keeping non-resume keys", async () => {
    const { values } = installChromeStorage({ unrelated: { keep: true } });
    const repository = createLocalStorageRepository();

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
    const repository = createLocalStorageRepository();

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
});
