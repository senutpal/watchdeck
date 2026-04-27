import { createResumeProgressTracker } from "../src/features/resume/progress-tracker";
import type { ResumeRecordInput } from "../src/storage/local-storage-repository";

function createVideo(currentTime = 10, duration = 120): HTMLVideoElement {
  const target = new EventTarget() as HTMLVideoElement;
  Object.defineProperty(target, "currentTime", { configurable: true, writable: true, value: currentTime });
  Object.defineProperty(target, "duration", { configurable: true, writable: true, value: duration });
  return target;
}

async function drainAsyncSaves(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("resume progress tracker", () => {
  const videoId = "dQw4w9WgXcQ";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throttles repeated timeupdate events inside a 15_000 ms window", async () => {
    let currentNow = 15_000;
    const video = createVideo(25, 300);
    const saveResumeRecord = vi.fn<(_input: ResumeRecordInput) => Promise<unknown>>().mockResolvedValue(undefined);

    createResumeProgressTracker({ videoId, video, saveResumeRecord, now: () => currentNow });

    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("timeupdate"));
    await drainAsyncSaves();

    expect(saveResumeRecord).toHaveBeenCalledTimes(1);
    expect(saveResumeRecord).toHaveBeenCalledWith({
      videoId,
      timestampSeconds: 25,
      durationSeconds: 300,
      updatedAtMs: 15_000
    });
  });

  it("saves a second record after the 15_000 ms throttle window", async () => {
    let currentNow = 15_000;
    const video = createVideo(25, 300);
    const saveResumeRecord = vi.fn<(_input: ResumeRecordInput) => Promise<unknown>>().mockResolvedValue(undefined);

    createResumeProgressTracker({ videoId, video, saveResumeRecord, now: () => currentNow });

    video.dispatchEvent(new Event("timeupdate"));
    await drainAsyncSaves();

    currentNow += 14_999;
    video.dispatchEvent(new Event("timeupdate"));
    await drainAsyncSaves();

    expect(saveResumeRecord).toHaveBeenCalledTimes(1);

    currentNow += 1;
    video.currentTime = 40;
    video.dispatchEvent(new Event("timeupdate"));
    await drainAsyncSaves();

    expect(saveResumeRecord).toHaveBeenCalledTimes(2);
    expect(saveResumeRecord).toHaveBeenLastCalledWith({
      videoId,
      timestampSeconds: 40,
      durationSeconds: 300,
      updatedAtMs: 30_000
    });
  });

  it("skips non-finite current time, non-finite duration, and zero duration", async () => {
    const saveResumeRecord = vi.fn<(_input: ResumeRecordInput) => Promise<unknown>>().mockResolvedValue(undefined);

    for (const video of [createVideo(Number.NaN, 300), createVideo(10, Number.POSITIVE_INFINITY), createVideo(10, 0)]) {
      createResumeProgressTracker({ videoId, video, saveResumeRecord, now: () => 15_000 });
      video.dispatchEvent(new Event("timeupdate"));
    }

    await drainAsyncSaves();

    expect(saveResumeRecord).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when a throttled save rejects", async () => {
    const video = createVideo(25, 300);
    const error = new Error("storage unavailable");
    const logger = { warn: vi.fn() };
    const saveResumeRecord = vi.fn<(_input: ResumeRecordInput) => Promise<unknown>>().mockRejectedValue(error);

    createResumeProgressTracker({ videoId, video, saveResumeRecord, now: () => 15_000, logger });

    expect(() => video.dispatchEvent(new Event("timeupdate"))).not.toThrow();
    await drainAsyncSaves();

    expect(logger.warn).toHaveBeenCalledWith("watchdeck resume progress save failed", error);
  });
});
