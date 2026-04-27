const RESUME_STORAGE_PREFIX = "watchdeck:resume:v1:";
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;
const SCHEMA_VERSION = 1;
const COMPLETED_SECONDS_THRESHOLD = 30;
const COMPLETED_RATIO_THRESHOLD = 0.95;

export interface ResumePlaybackRecord {
  readonly schemaVersion: 1;
  readonly videoId: string;
  readonly timestampSeconds: number;
  readonly durationSeconds: number;
  readonly updatedAtMs: number;
  readonly completed: boolean;
}

export interface ResumeRecordInput {
  readonly videoId: string;
  readonly timestampSeconds: number;
  readonly durationSeconds: number;
  readonly updatedAtMs?: number;
}

export interface ResumePruneOptions {
  readonly maxRecords?: number;
  readonly maxAgeMs?: number;
}

export interface ResumePruneResult {
  readonly pruned: number;
  readonly remaining: number;
}

export interface LocalStorageRepository {
  readonly areaName: "local";
  isAvailable(): boolean;
  getResumeRecord(videoId: string): Promise<ResumePlaybackRecord | null>;
  saveResumeRecord(input: ResumeRecordInput): Promise<ResumePlaybackRecord | null>;
  deleteResumeRecord(videoId: string): Promise<void>;
  listResumeRecords(): Promise<ResumePlaybackRecord[]>;
  pruneResumeRecords(options?: ResumePruneOptions): Promise<ResumePruneResult>;
}

export interface LocalStorageRepositoryOptions {
  readonly logger?: Pick<Console, "warn">;
  readonly now?: () => number;
}

type LocalStorageArea = Pick<chrome.storage.StorageArea, "get" | "set" | "remove">;

function storageKeyFor(videoId: string): string {
  return `${RESUME_STORAGE_PREFIX}${videoId}`;
}

function isValidVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId);
}

function isRecord(value: unknown): value is ResumePlaybackRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.schemaVersion === SCHEMA_VERSION
    && typeof record.videoId === "string"
    && isValidVideoId(record.videoId)
    && Number.isFinite(record.timestampSeconds)
    && Number.isFinite(record.durationSeconds)
    && Number.isFinite(record.updatedAtMs)
    && typeof record.completed === "boolean";
}

function normalizeRecord(input: ResumeRecordInput, now: () => number): ResumePlaybackRecord | null {
  if (!isValidVideoId(input.videoId) || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    return null;
  }

  if (!Number.isFinite(input.timestampSeconds)) {
    return null;
  }

  const durationSeconds = Math.round(input.durationSeconds);

  if (durationSeconds <= 0) {
    return null;
  }

  const timestampSeconds = Math.round(Math.min(Math.max(input.timestampSeconds, 0), durationSeconds));
  const completed = durationSeconds - timestampSeconds <= COMPLETED_SECONDS_THRESHOLD
    || timestampSeconds / durationSeconds >= COMPLETED_RATIO_THRESHOLD;

  return {
    schemaVersion: SCHEMA_VERSION,
    videoId: input.videoId,
    timestampSeconds,
    durationSeconds,
    updatedAtMs: input.updatedAtMs ?? now(),
    completed
  };
}

function warn(logger: Pick<Console, "warn">, message: string, error: unknown): void {
  logger.warn(message, error);
}

export function createLocalStorageRepository(options: LocalStorageRepositoryOptions = {}): LocalStorageRepository {
  const logger = options.logger ?? console;
  const now = options.now ?? Date.now;

  function getStorage(): LocalStorageArea | null {
    return typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;
  }

  return {
    areaName: "local",
    isAvailable() {
      return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
    },
    async getResumeRecord(videoId) {
      if (!isValidVideoId(videoId)) {
        return null;
      }

      const storage = getStorage();
      if (!storage) {
        return null;
      }

      try {
        const key = storageKeyFor(videoId);
        const stored = await storage.get(key);
        const value = stored[key];
        return isRecord(value) ? value : null;
      } catch (error) {
        warn(logger, "watchdeck failed to read resume record", error);
        return null;
      }
    },
    async saveResumeRecord(input) {
      const record = normalizeRecord(input, now);
      const storage = getStorage();

      if (!record || !storage) {
        return null;
      }

      try {
        await storage.set({ [storageKeyFor(record.videoId)]: record });
        return record;
      } catch (error) {
        warn(logger, "watchdeck failed to save resume record", error);
        return null;
      }
    },
    async deleteResumeRecord(videoId) {
      if (!isValidVideoId(videoId)) {
        return;
      }

      const storage = getStorage();
      if (!storage) {
        return;
      }

      try {
        await storage.remove(storageKeyFor(videoId));
      } catch (error) {
        warn(logger, "watchdeck failed to delete resume record", error);
      }
    },
    async listResumeRecords() {
      const storage = getStorage();
      if (!storage) {
        return [];
      }

      try {
        const stored = await storage.get(null);
        return Object.entries(stored)
          .filter(([key, value]) => key.startsWith(RESUME_STORAGE_PREFIX) && isRecord(value))
          .map(([, value]) => value as ResumePlaybackRecord);
      } catch (error) {
        warn(logger, "watchdeck failed to list resume records", error);
        return [];
      }
    },
    async pruneResumeRecords() {
      const records = await this.listResumeRecords();
      return { pruned: 0, remaining: records.length };
    }
  };
}
