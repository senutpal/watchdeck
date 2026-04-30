import type { ResumePlaybackRecord } from "../../storage/local-storage-repository";

export interface ResumePolicyThresholds {
  readonly nearStartSeconds: number;
  readonly nearEndSeconds: number;
  readonly nearEndRatio: number;
  readonly alreadyCloseSeconds: number;
}

export interface ResumePolicyInput {
  readonly videoId: string;
  readonly record: ResumePlaybackRecord | null | undefined;
  readonly currentTimeSeconds: number;
  readonly attempted: boolean;
  readonly thresholds?: Partial<ResumePolicyThresholds>;
}

export type ResumePolicySkipReason =
  | "already-attempted"
  | "no-record"
  | "video-mismatch"
  | "invalid-media-state"
  | "near-start"
  | "near-end"
  | "already-close";

export type ResumePolicyDecision =
  | { readonly shouldResume: true; readonly targetSeconds: number }
  | { readonly shouldResume: false; readonly reason: ResumePolicySkipReason };

export const DEFAULT_RESUME_POLICY_THRESHOLDS: ResumePolicyThresholds = {
  nearStartSeconds: 30,
  nearEndSeconds: 30,
  nearEndRatio: 0.95,
  alreadyCloseSeconds: 5
};

export function evaluateResumePolicy(input: ResumePolicyInput): ResumePolicyDecision {
  const thresholds = { ...DEFAULT_RESUME_POLICY_THRESHOLDS, ...input.thresholds };

  if (input.attempted) {
    return skip("already-attempted");
  }

  if (!input.record) {
    return skip("no-record");
  }

  if (input.record.videoId !== input.videoId) {
    return skip("video-mismatch");
  }

  const { timestampSeconds, durationSeconds } = input.record;

  if (!Number.isFinite(input.currentTimeSeconds)
    || !Number.isFinite(timestampSeconds)
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0) {
    return skip("invalid-media-state");
  }

  if (timestampSeconds < thresholds.nearStartSeconds) {
    return skip("near-start");
  }

  if (input.record.completed
    || durationSeconds - timestampSeconds <= thresholds.nearEndSeconds
    || timestampSeconds / durationSeconds >= thresholds.nearEndRatio) {
    return skip("near-end");
  }

  if (Math.abs(input.currentTimeSeconds - timestampSeconds) <= thresholds.alreadyCloseSeconds) {
    return skip("already-close");
  }

  return {
    shouldResume: true,
    targetSeconds: Math.min(Math.max(timestampSeconds, 0), durationSeconds)
  };
}

function skip(reason: ResumePolicySkipReason): ResumePolicyDecision {
  return { shouldResume: false, reason };
}
