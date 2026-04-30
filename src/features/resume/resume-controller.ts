import type { ResumePlaybackRecord } from "../../storage/local-storage-repository";
import {
  evaluateResumePolicy,
  type ResumePolicyDecision,
  type ResumePolicyInput
} from "./resume-policy";

const USER_MOVE_THRESHOLD_SECONDS = 5;
const LOOKUP_FAILURE_MESSAGE = "watchdeck auto resume lookup failed";

export interface AutoResumeController {
  readonly cleanup: () => Promise<void>;
}

export interface AutoResumeControllerOptions {
  readonly videoId: string;
  readonly video: HTMLVideoElement;
  readonly getResumeRecord: (videoId: string) => Promise<ResumePlaybackRecord | null>;
  readonly evaluatePolicy?: (input: ResumePolicyInput) => ResumePolicyDecision;
  readonly logger?: Pick<Console, "warn">;
  readonly onSettled?: () => void;
}

export function createAutoResumeController(options: AutoResumeControllerOptions): AutoResumeController {
  const evaluatePolicy = options.evaluatePolicy ?? evaluateResumePolicy;
  const logger = options.logger ?? console;
  const baselineSeconds = options.video.currentTime;
  let attempted = false;
  let cleanedUp = false;
  let terminal = false;
  let suppressedByUser = false;
  let programmaticSeek = false;
  let listenersAttached = true;
  let settled = false;

  const removeListeners = (): void => {
    if (!listenersAttached) {
      return;
    }

    listenersAttached = false;
    options.video.removeEventListener("seeking", handleSeeking);
    options.video.removeEventListener("timeupdate", handleTimeUpdate);
  };

  const finish = (): void => {
    terminal = true;
    removeListeners();
    settle();
  };

  const settle = (): void => {
    if (settled) {
      return;
    }

    settled = true;
    options.onSettled?.();
  };

  function handleSeeking(): void {
    if (!programmaticSeek && !terminal) {
      suppressedByUser = true;
    }
  }

  function handleTimeUpdate(): void {
    if (programmaticSeek || terminal || suppressedByUser) {
      return;
    }

    const currentTimeSeconds = options.video.currentTime;
    if (Number.isFinite(baselineSeconds)
      && Number.isFinite(currentTimeSeconds)
      && Math.abs(currentTimeSeconds - baselineSeconds) > USER_MOVE_THRESHOLD_SECONDS) {
      suppressedByUser = true;
    }
  }

  options.video.addEventListener("seeking", handleSeeking);
  options.video.addEventListener("timeupdate", handleTimeUpdate);
  void applySavedRecord();

  return {
    async cleanup() {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      removeListeners();
      settle();
    }
  };

  async function applySavedRecord(): Promise<void> {
    let record: ResumePlaybackRecord | null;

    try {
      record = await options.getResumeRecord(options.videoId);
    } catch (error) {
      if (!cleanedUp) {
        logger.warn(LOOKUP_FAILURE_MESSAGE, error);
        finish();
      }
      return;
    }

    if (cleanedUp) {
      return;
    }

    if (suppressedByUser) {
      finish();
      return;
    }

    const decision = evaluatePolicy({
      videoId: options.videoId,
      record,
      currentTimeSeconds: options.video.currentTime,
      attempted
    });

    if (!decision.shouldResume) {
      finish();
      return;
    }

    attempted = true;
    programmaticSeek = true;
    try {
      options.video.currentTime = decision.targetSeconds;
    } finally {
      void Promise.resolve().then(() => {
        programmaticSeek = false;
      });
      finish();
    }
  }
}
