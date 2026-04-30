import { DEFAULT_RESUME_POLICY_THRESHOLDS, evaluateResumePolicy } from "../src/features/resume/resume-policy";
import type { ResumePlaybackRecord } from "../src/storage/local-storage-repository";

const videoId = "dQw4w9WgXcQ";

function createRecord(overrides: Partial<ResumePlaybackRecord> = {}): ResumePlaybackRecord {
  return {
    schemaVersion: 1,
    videoId,
    timestampSeconds: 120,
    durationSeconds: 600,
    updatedAtMs: 1000,
    completed: false,
    ...overrides
  };
}

describe("resume policy", () => {
  it("allows an eligible saved timestamp", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord(),
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: true, targetSeconds: 120 });
  });

  it("skips saved progress near the beginning", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ timestampSeconds: DEFAULT_RESUME_POLICY_THRESHOLDS.nearStartSeconds - 1 }),
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "near-start" });
  });

  it("skips completed or near-end saved progress", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ completed: true }),
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "near-end" });

    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ timestampSeconds: 575, durationSeconds: 600 }),
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "near-end" });

    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ timestampSeconds: 570, durationSeconds: 600 }),
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "near-end" });
  });

  it("skips when the player is already close to the saved timestamp", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ timestampSeconds: 120 }),
      currentTimeSeconds: 116,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "already-close" });
  });

  it("returns no-record for missing records", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: null,
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "no-record" });
  });

  it("rejects invalid media state", () => {
    for (const input of [
      { record: createRecord(), currentTimeSeconds: Number.NaN },
      { record: createRecord({ timestampSeconds: Number.POSITIVE_INFINITY }), currentTimeSeconds: 0 },
      { record: createRecord({ durationSeconds: 0 }), currentTimeSeconds: 0 }
    ]) {
      expect(evaluateResumePolicy({
        videoId,
        record: input.record,
        currentTimeSeconds: input.currentTimeSeconds,
        attempted: false
      })).toEqual({ shouldResume: false, reason: "invalid-media-state" });
    }
  });

  it("skips after the context has already attempted resume", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord(),
      currentTimeSeconds: 0,
      attempted: true
    })).toEqual({ shouldResume: false, reason: "already-attempted" });
  });

  it("rejects records for a different video", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ videoId: "J---aiyznGQ" }),
      currentTimeSeconds: 0,
      attempted: false
    })).toEqual({ shouldResume: false, reason: "video-mismatch" });
  });

  it("clamps approved target seconds into the record duration", () => {
    expect(evaluateResumePolicy({
      videoId,
      record: createRecord({ timestampSeconds: -5, durationSeconds: 600 }),
      currentTimeSeconds: 60,
      attempted: false,
      thresholds: { nearStartSeconds: -10 }
    })).toEqual({ shouldResume: true, targetSeconds: 0 });
  });
});
