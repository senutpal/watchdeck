import { createAutoResumeController } from "../src/features/resume/resume-controller";
import type { ResumePolicyDecision, ResumePolicyInput } from "../src/features/resume/resume-policy";
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createVideo(currentTime = 0, duration = 600): HTMLVideoElement {
  const target = new EventTarget() as HTMLVideoElement;
  Object.defineProperty(target, "currentTime", { configurable: true, writable: true, value: currentTime });
  Object.defineProperty(target, "duration", { configurable: true, writable: true, value: duration });
  return target;
}

async function drainAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("auto resume controller", () => {
  it("looks up the saved record once and seeks to the approved policy target", async () => {
    const lookup = createDeferred<ResumePlaybackRecord | null>();
    const getResumeRecord = vi.fn(() => lookup.promise);
    const video = createVideo(0, 600);

    createAutoResumeController({ videoId, video, getResumeRecord });

    expect(getResumeRecord).toHaveBeenCalledTimes(1);
    expect(getResumeRecord).toHaveBeenCalledWith(videoId);

    lookup.resolve(createRecord());
    await drainAsyncWork();

    expect(video.currentTime).toBe(120);
  });

  it("does not seek when policy returns a skip decision", async () => {
    const evaluatePolicy = vi.fn<(_input: ResumePolicyInput) => ResumePolicyDecision>(() => ({
      shouldResume: false,
      reason: "near-start"
    }));
    const video = createVideo(10, 600);

    createAutoResumeController({
      videoId,
      video,
      getResumeRecord: vi.fn(() => Promise.resolve(createRecord())),
      evaluatePolicy
    });
    await drainAsyncWork();

    expect(evaluatePolicy).toHaveBeenCalledWith(expect.objectContaining({
      videoId,
      currentTimeSeconds: 10,
      attempted: false
    }));
    expect(video.currentTime).toBe(10);
  });

  it("cleanup removes listeners and prevents delayed lookup from seeking", async () => {
    const lookup = createDeferred<ResumePlaybackRecord | null>();
    const video = createVideo(0, 600);
    const removeEventListener = vi.spyOn(video, "removeEventListener");
    const controller = createAutoResumeController({
      videoId,
      video,
      getResumeRecord: vi.fn(() => lookup.promise)
    });

    await controller.cleanup();
    lookup.resolve(createRecord());
    await drainAsyncWork();

    expect(video.currentTime).toBe(0);
    expect(removeEventListener).toHaveBeenCalledWith("seeking", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("timeupdate", expect.any(Function));
  });

  it("suppresses pending auto-resume after user seeking", async () => {
    const lookup = createDeferred<ResumePlaybackRecord | null>();
    const video = createVideo(0, 600);

    createAutoResumeController({ videoId, video, getResumeRecord: vi.fn(() => lookup.promise) });
    video.dispatchEvent(new Event("seeking"));
    lookup.resolve(createRecord());
    await drainAsyncWork();

    expect(video.currentTime).toBe(0);
  });

  it("suppresses pending auto-resume after a large user timeupdate movement", async () => {
    const lookup = createDeferred<ResumePlaybackRecord | null>();
    const video = createVideo(0, 600);

    createAutoResumeController({ videoId, video, getResumeRecord: vi.fn(() => lookup.promise) });
    video.currentTime = 6;
    video.dispatchEvent(new Event("timeupdate"));
    lookup.resolve(createRecord());
    await drainAsyncWork();

    expect(video.currentTime).toBe(6);
  });

  it("does not treat its own currentTime assignment as user intervention", async () => {
    const video = createVideo(0, 600);
    let currentTime = 0;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (value) => {
        currentTime = value;
        video.dispatchEvent(new Event("seeking"));
      }
    });

    createAutoResumeController({
      videoId,
      video,
      getResumeRecord: vi.fn(() => Promise.resolve(createRecord()))
    });
    await drainAsyncWork();

    expect(video.currentTime).toBe(120);
  });

  it("warns and no-ops when resume record lookup fails", async () => {
    const error = new Error("storage failed");
    const logger = { warn: vi.fn() };
    const video = createVideo(0, 600);

    createAutoResumeController({
      videoId,
      video,
      getResumeRecord: vi.fn(() => Promise.reject(error)),
      logger
    });
    await drainAsyncWork();

    expect(video.currentTime).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith("watchdeck auto resume lookup failed", error);
  });

  it("calls onResumeApplied once after applying an approved resume target", async () => {
    const video = createVideo(0, 600);
    const onResumeApplied = vi.fn();

    createAutoResumeController({
      videoId,
      video,
      getResumeRecord: vi.fn(() => Promise.resolve(createRecord())),
      onResumeApplied
    });
    await drainAsyncWork();

    expect(video.currentTime).toBe(120);
    expect(onResumeApplied).toHaveBeenCalledTimes(1);
    expect(onResumeApplied).toHaveBeenCalledWith(120);
  });

  it("does not call onResumeApplied for skipped or cleaned up resume attempts", async () => {
    const skipped = vi.fn();
    createAutoResumeController({
      videoId,
      video: createVideo(10, 600),
      getResumeRecord: vi.fn(() => Promise.resolve(createRecord())),
      evaluatePolicy: vi.fn<(_input: ResumePolicyInput) => ResumePolicyDecision>(() => ({
        shouldResume: false,
        reason: "near-start"
      })),
      onResumeApplied: skipped
    });
    await drainAsyncWork();

    const lookup = createDeferred<ResumePlaybackRecord | null>();
    const cleanedUp = vi.fn();
    const controller = createAutoResumeController({
      videoId,
      video: createVideo(0, 600),
      getResumeRecord: vi.fn(() => lookup.promise),
      onResumeApplied: cleanedUp
    });

    await controller.cleanup();
    lookup.resolve(createRecord());
    await drainAsyncWork();

    expect(skipped).not.toHaveBeenCalled();
    expect(cleanedUp).not.toHaveBeenCalled();
  });
});
