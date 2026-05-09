import { afterEach, describe, expect, it, vi } from "vitest";
import { createResumeProgressTracker, DEFAULT_THROTTLE_MS } from "../src/features/resume/progress-tracker";
import type { ResumeRecordInput } from "../src/storage/local-storage-repository";

function createVideo(currentTime = 0, duration = 600): HTMLVideoElement {
  const target = new EventTarget() as HTMLVideoElement;
  Object.defineProperty(target, "currentTime", { configurable: true, writable: true, value: currentTime });
  Object.defineProperty(target, "duration", { configurable: true, writable: true, value: duration });
  return target;
}

async function drainAsyncSaves(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("storage write frequency stays bounded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes at most ceil(elapsed / throttle) records during simulated playback", async () => {
    let nowMs = 0;
    const video = createVideo(0, 600);
    const saveResumeRecord = vi
      .fn<(_input: ResumeRecordInput) => Promise<unknown>>()
      .mockResolvedValue(undefined);

    createResumeProgressTracker({
      videoId: "dQw4w9WgXcQ",
      video,
      saveResumeRecord,
      now: () => nowMs,
      throttleMs: DEFAULT_THROTTLE_MS
    });

    const totalSeconds = 60;
    const eventsPerSecond = 4;
    const stepMs = Math.floor(1000 / eventsPerSecond);

    for (let tick = 0; tick < totalSeconds * eventsPerSecond; tick++) {
      nowMs += stepMs;
      (video as unknown as { currentTime: number }).currentTime = nowMs / 1000;
      video.dispatchEvent(new Event("timeupdate"));
    }
    await drainAsyncSaves();

    const maxAllowed = Math.ceil((totalSeconds * 1000) / DEFAULT_THROTTLE_MS);
    expect(saveResumeRecord.mock.calls.length).toBeLessThanOrEqual(maxAllowed);
    expect(saveResumeRecord.mock.calls.length).toBeGreaterThan(0);
  });

  it("writes are bounded by throttle even at 30 Hz event rate", async () => {
    let nowMs = 0;
    const video = createVideo(0, 600);
    const saveResumeRecord = vi
      .fn<(_input: ResumeRecordInput) => Promise<unknown>>()
      .mockResolvedValue(undefined);

    createResumeProgressTracker({
      videoId: "dQw4w9WgXcQ",
      video,
      saveResumeRecord,
      now: () => nowMs,
      throttleMs: DEFAULT_THROTTLE_MS
    });

    const totalSeconds = 60;
    const eventsPerSecond = 30;
    const stepMs = Math.floor(1000 / eventsPerSecond);

    for (let tick = 0; tick < totalSeconds * eventsPerSecond; tick++) {
      nowMs += stepMs;
      (video as unknown as { currentTime: number }).currentTime = nowMs / 1000;
      video.dispatchEvent(new Event("timeupdate"));
    }
    await drainAsyncSaves();

    const maxAllowed = Math.ceil((totalSeconds * 1000) / DEFAULT_THROTTLE_MS);
    expect(saveResumeRecord.mock.calls.length).toBeLessThanOrEqual(maxAllowed);
    expect(saveResumeRecord.mock.calls.length).toBeGreaterThan(0);
  });
});
