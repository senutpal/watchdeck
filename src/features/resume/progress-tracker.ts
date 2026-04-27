import type { ResumeRecordInput } from "../../storage/local-storage-repository";

const DEFAULT_THROTTLE_MS = 15_000;
const SAVE_FAILURE_MESSAGE = "watchdeck resume progress save failed";

export interface ResumeProgressTracker {
  readonly flush: () => Promise<void>;
  readonly cleanup: () => Promise<void>;
}

export interface ResumeProgressTrackerOptions {
  readonly videoId: string;
  readonly video: HTMLVideoElement;
  readonly saveResumeRecord: (input: ResumeRecordInput) => Promise<unknown>;
  readonly now: () => number;
  readonly logger?: Pick<Console, "warn">;
  readonly throttleMs?: number;
  readonly documentTarget?: Document;
  readonly windowTarget?: Window;
}

export function createResumeProgressTracker(options: ResumeProgressTrackerOptions): ResumeProgressTracker {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const logger = options.logger ?? console;
  let lastSavedAtMs = Number.NEGATIVE_INFINITY;

  const persist = async (input: ResumeRecordInput): Promise<void> => {
    try {
      await options.saveResumeRecord(input);
    } catch (error) {
      logger.warn(SAVE_FAILURE_MESSAGE, error);
    }
  };

  const saveThrottled = (): void => {
    const updatedAtMs = options.now();

    if (updatedAtMs - lastSavedAtMs < throttleMs) {
      return;
    }

    const input = createRecordInput(updatedAtMs);

    if (!input) {
      return;
    }

    lastSavedAtMs = updatedAtMs;
    void persist(input);
  };

  options.video.addEventListener("timeupdate", saveThrottled);

  return {
    async flush() {
      const input = createRecordInput(options.now());

      if (input) {
        await persist(input);
      }
    },
    async cleanup() {
      options.video.removeEventListener("timeupdate", saveThrottled);
    }
  };

  function createRecordInput(updatedAtMs: number): ResumeRecordInput | null {
    const { currentTime, duration } = options.video;

    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return {
      videoId: options.videoId,
      timestampSeconds: currentTime,
      durationSeconds: duration,
      updatedAtMs
    };
  }
}
