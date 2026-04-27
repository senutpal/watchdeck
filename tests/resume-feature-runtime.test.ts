import {
  createYoutubeAdapter,
  type SupportedYoutubeWatchContext,
  type YoutubeRuntimeState,
  type YoutubeWatchContext
} from "../src/adapters/youtube";
import { createExtensionContext } from "../src/core/extension-context";
import { createFeatureRegistry } from "../src/core/feature-registry";
import { createResumeFeature } from "../src/features/resume";
import type { ResumeProgressTrackerOptions } from "../src/features/resume/progress-tracker";

const supportedContext: SupportedYoutubeWatchContext = {
  supported: true,
  videoId: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
};

const nextSupportedContext: SupportedYoutubeWatchContext = {
  supported: true,
  videoId: "J---aiyznGQ",
  url: "https://www.youtube.com/watch?v=J---aiyznGQ"
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function createVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    currentTime: 42,
    duration: 120,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

describe("resume feature runtime", () => {
  it("starts navigation observation and waits for ready players only for supported contexts", async () => {
    const navigationCleanup = vi.fn();
    const playerCleanup = vi.fn();
    const onReady = vi.fn();
    const waitForReadyPlayer = vi.fn(() => ({
      promise: Promise.resolve({ context: supportedContext, video: {} as HTMLVideoElement }),
      cleanup: playerCleanup
    }));

    const adapter = createYoutubeAdapter({
      diagnostics: { emit: vi.fn() },
      navigationObserver: {
        start(callback) {
          callback({ supported: false, reason: "shorts", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" });
          callback(supportedContext);
          return navigationCleanup;
        }
      },
      waitForReadyPlayer
    });

    const cleanup = adapter.start(onReady);
    await Promise.resolve();

    expect(waitForReadyPlayer).toHaveBeenCalledTimes(1);
    expect(waitForReadyPlayer).toHaveBeenCalledWith(supportedContext, expect.objectContaining({ diagnostics: expect.any(Object) }));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe("ready");

    cleanup();
    expect(navigationCleanup).toHaveBeenCalledTimes(1);
    expect(playerCleanup).toHaveBeenCalledTimes(1);
  });

  it("cleans pending player waits when navigation becomes unsupported", () => {
    const playerCleanup = vi.fn();
    let emitContext: ((context: YoutubeWatchContext) => void) | undefined;

    const adapter = createYoutubeAdapter({
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi.fn(() => ({
        promise: new Promise<YoutubeRuntimeState | null>(() => undefined),
        cleanup: playerCleanup
      }))
    });

    adapter.start();
    emitContext?.(supportedContext);
    emitContext?.({ supported: false, reason: "non-watch-page", url: "https://www.youtube.com/" });

    expect(playerCleanup).toHaveBeenCalledTimes(1);
  });

  it("resets ready status after unsupported navigation and cleanup", async () => {
    let emitContext: ((context: YoutubeWatchContext) => void) | undefined;

    const adapter = createYoutubeAdapter({
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi.fn(() => ({
        promise: Promise.resolve({ context: supportedContext, video: {} as HTMLVideoElement }),
        cleanup: vi.fn()
      }))
    });

    const cleanup = adapter.start();
    emitContext?.(supportedContext);
    await Promise.resolve();

    expect(adapter.status).toBe("ready");

    emitContext?.({ supported: false, reason: "shorts", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" });
    expect(adapter.status).toBe("idle");

    emitContext?.(supportedContext);
    await Promise.resolve();

    expect(adapter.status).toBe("ready");

    cleanup();
    expect(adapter.status).toBe("idle");
  });

  it("ignores stale player readiness after route changes", async () => {
    const firstReady = createDeferred<YoutubeRuntimeState | null>();
    const secondReady = createDeferred<YoutubeRuntimeState | null>();
    const onReady = vi.fn();
    let emitContext: ((context: YoutubeWatchContext) => void) | undefined;

    const adapter = createYoutubeAdapter({
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi
        .fn()
        .mockReturnValueOnce({ promise: firstReady.promise, cleanup: vi.fn() })
        .mockReturnValueOnce({ promise: secondReady.promise, cleanup: vi.fn() })
    });

    adapter.start(onReady);
    emitContext?.(supportedContext);
    emitContext?.(nextSupportedContext);

    firstReady.resolve({ context: supportedContext, video: {} as HTMLVideoElement });
    await Promise.resolve();

    expect(adapter.status).toBe("idle");
    expect(onReady).not.toHaveBeenCalled();

    secondReady.resolve({ context: nextSupportedContext, video: {} as HTMLVideoElement });
    await Promise.resolve();

    expect(adapter.status).toBe("ready");
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith({ context: nextSupportedContext, video: expect.any(Object) });
  });

  it("calls the before-context-change hook with the previous ready state before a replacement is ready", async () => {
    const firstState = { context: supportedContext, video: {} as HTMLVideoElement };
    const secondState = { context: nextSupportedContext, video: {} as HTMLVideoElement };
    const onBeforeContextChange = vi.fn();
    const onReady = vi.fn();
    let emitContext: ((context: YoutubeWatchContext) => void) | undefined;

    const adapter = createYoutubeAdapter({
      onBeforeContextChange,
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi
        .fn()
        .mockReturnValueOnce({ promise: Promise.resolve(firstState), cleanup: vi.fn() })
        .mockReturnValueOnce({ promise: Promise.resolve(secondState), cleanup: vi.fn() })
    });

    adapter.start(onReady);
    emitContext?.(supportedContext);
    await Promise.resolve();

    expect(onReady).toHaveBeenCalledWith(firstState);

    emitContext?.(nextSupportedContext);

    expect(onBeforeContextChange).toHaveBeenCalledTimes(1);
    expect(onBeforeContextChange).toHaveBeenCalledWith(firstState);
    expect(onReady).toHaveBeenCalledTimes(1);

    await Promise.resolve();

    expect(onReady).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenLastCalledWith(secondState);
  });

  it("calls the before-context-change hook once when a ready route becomes unsupported", async () => {
    const state = { context: supportedContext, video: {} as HTMLVideoElement };
    const onBeforeContextChange = vi.fn();
    let emitContext: ((context: YoutubeWatchContext) => void) | undefined;

    const adapter = createYoutubeAdapter({
      onBeforeContextChange,
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi.fn(() => ({ promise: Promise.resolve(state), cleanup: vi.fn() }))
    });

    adapter.start();
    emitContext?.(supportedContext);
    await Promise.resolve();

    emitContext?.({ supported: false, reason: "non-watch-page", url: "https://www.youtube.com/" });

    expect(onBeforeContextChange).toHaveBeenCalledTimes(1);
    expect(onBeforeContextChange).toHaveBeenCalledWith(state);
  });

  it("calls the before-context-change hook once during repeated adapter cleanup", async () => {
    const state = { context: supportedContext, video: {} as HTMLVideoElement };
    const onBeforeContextChange = vi.fn();
    let emitContext: ((context: YoutubeWatchContext) => void) | undefined;

    const adapter = createYoutubeAdapter({
      onBeforeContextChange,
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi.fn(() => ({ promise: Promise.resolve(state), cleanup: vi.fn() }))
    });

    const cleanup = adapter.start();
    emitContext?.(supportedContext);
    await Promise.resolve();

    cleanup();
    cleanup();

    expect(onBeforeContextChange).toHaveBeenCalledTimes(1);
    expect(onBeforeContextChange).toHaveBeenCalledWith(state);
  });

  it("returns adapter cleanup through the feature registry lifecycle", async () => {
    const registry = createFeatureRegistry();
    const navigationCleanup = vi.fn();
    const playerCleanup = vi.fn();
    let emitContext: ((context: SupportedYoutubeWatchContext) => void) | undefined;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    registry.register(createResumeFeature({
      createAdapter: (context) => createYoutubeAdapter({
        diagnostics: { emit: (event) => context.logger.debug("diagnostic", event) },
        navigationObserver: {
          start(callback) {
            emitContext = (nextContext) => callback(nextContext);
            return navigationCleanup;
          }
        },
        waitForReadyPlayer: vi.fn(() => ({
          promise: Promise.resolve({ context: supportedContext, video: {} as HTMLVideoElement }),
          cleanup: playerCleanup
        }))
      })
    }));

    await registry.mountAll(createExtensionContext({ debug: true, logger }));
    emitContext?.(supportedContext);
    await Promise.resolve();

    expect(logger.debug).toHaveBeenCalledWith("watchdeck resume runtime ready", {
      adapterStatus: "ready",
      videoId: "dQw4w9WgXcQ"
    });

    await registry.unmountAll();

    expect(navigationCleanup).toHaveBeenCalledTimes(1);
    expect(playerCleanup).toHaveBeenCalledTimes(1);
  });

  it("creates a progress tracker for a ready video using the canonical video id and repository save", async () => {
    let onReady: ((state: YoutubeRuntimeState) => void) | undefined;
    const now = vi.fn(() => 1234);
    const saveResumeRecord = vi.fn(() => Promise.resolve());
    const createProgressTracker = vi.fn(() => ({ flush: vi.fn(() => Promise.resolve()), cleanup: vi.fn(() => Promise.resolve()) }));
    const video = createVideo();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const registry = createFeatureRegistry();
    registry.register(createResumeFeature({
      createAdapter: () => ({
        get status() {
          return "ready" as const;
        },
        start(callback) {
          onReady = callback;
          return vi.fn();
        }
      }),
      createRepository: () => ({
        areaName: "local" as const,
        isAvailable: vi.fn(() => true),
        getResumeRecord: vi.fn(() => Promise.resolve(null)),
        saveResumeRecord,
        deleteResumeRecord: vi.fn(() => Promise.resolve()),
        listResumeRecords: vi.fn(() => Promise.resolve([])),
        pruneResumeRecords: vi.fn(() => Promise.resolve({ pruned: 0, remaining: 0 }))
      }),
      createProgressTracker
    }));

    await registry.mountAll(createExtensionContext({ debug: true, logger, now }));
    onReady?.({ context: supportedContext, video });

    expect(createProgressTracker).toHaveBeenCalledTimes(1);
    expect(createProgressTracker).toHaveBeenCalledWith(expect.objectContaining({
      videoId: "dQw4w9WgXcQ",
      video,
      saveResumeRecord,
      now,
      logger
    } satisfies Partial<ResumeProgressTrackerOptions>));
    expect(logger.debug).toHaveBeenCalledWith("watchdeck resume runtime ready", {
      adapterStatus: "ready",
      videoId: "dQw4w9WgXcQ"
    });
  });

  it("flushes and cleans the active tracker before replacing it with a second ready video", async () => {
    let onReady: ((state: YoutubeRuntimeState) => void) | undefined;
    const firstTracker = { flush: vi.fn(() => Promise.resolve()), cleanup: vi.fn(() => Promise.resolve()) };
    const secondTracker = { flush: vi.fn(() => Promise.resolve()), cleanup: vi.fn(() => Promise.resolve()) };
    const createProgressTracker = vi.fn()
      .mockReturnValueOnce(firstTracker)
      .mockReturnValueOnce(secondTracker);

    const registry = createFeatureRegistry();
    registry.register(createResumeFeature({
      createAdapter: () => ({ status: "idle", start: (callback) => { onReady = callback; return vi.fn(); } }),
      createRepository: () => ({
        areaName: "local" as const,
        isAvailable: vi.fn(() => true),
        getResumeRecord: vi.fn(() => Promise.resolve(null)),
        saveResumeRecord: vi.fn(() => Promise.resolve()),
        deleteResumeRecord: vi.fn(() => Promise.resolve()),
        listResumeRecords: vi.fn(() => Promise.resolve([])),
        pruneResumeRecords: vi.fn(() => Promise.resolve({ pruned: 0, remaining: 0 }))
      }),
      createProgressTracker
    }));

    await registry.mountAll(createExtensionContext());
    onReady?.({ context: supportedContext, video: createVideo() });
    onReady?.({ context: nextSupportedContext, video: createVideo() });
    await Promise.resolve();

    expect(firstTracker.flush).toHaveBeenCalledTimes(1);
    expect(firstTracker.cleanup).toHaveBeenCalledTimes(1);
    expect(createProgressTracker).toHaveBeenCalledTimes(2);
    expect(createProgressTracker).toHaveBeenLastCalledWith(expect.objectContaining({ videoId: "J---aiyznGQ" }));
  });

  it("flushes and cleans the active tracker exactly once when the registry unmounts", async () => {
    let onReady: ((state: YoutubeRuntimeState) => void) | undefined;
    const adapterCleanup = vi.fn();
    const tracker = { flush: vi.fn(() => Promise.resolve()), cleanup: vi.fn(() => Promise.resolve()) };
    const registry = createFeatureRegistry();

    registry.register(createResumeFeature({
      createAdapter: () => ({ status: "idle", start: (callback) => { onReady = callback; return adapterCleanup; } }),
      createRepository: () => ({
        areaName: "local" as const,
        isAvailable: vi.fn(() => true),
        getResumeRecord: vi.fn(() => Promise.resolve(null)),
        saveResumeRecord: vi.fn(() => Promise.resolve()),
        deleteResumeRecord: vi.fn(() => Promise.resolve()),
        listResumeRecords: vi.fn(() => Promise.resolve([])),
        pruneResumeRecords: vi.fn(() => Promise.resolve({ pruned: 0, remaining: 0 }))
      }),
      createProgressTracker: vi.fn(() => tracker)
    }));

    await registry.mountAll(createExtensionContext());
    onReady?.({ context: supportedContext, video: createVideo() });
    await registry.unmountAll();
    await Promise.resolve();

    expect(adapterCleanup).toHaveBeenCalledTimes(1);
    expect(tracker.flush).toHaveBeenCalledTimes(1);
    expect(tracker.cleanup).toHaveBeenCalledTimes(1);
  });

  it("catches tracker flush and cleanup failures during route leave and unmount", async () => {
    let adapterOptions: Parameters<typeof createYoutubeAdapter>[0] | undefined;
    let onReady: ((state: YoutubeRuntimeState) => void) | undefined;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const tracker = {
      flush: vi.fn(() => Promise.reject(new Error("flush failed"))),
      cleanup: vi.fn(() => Promise.reject(new Error("cleanup failed")))
    };
    const registry = createFeatureRegistry();

    registry.register(createResumeFeature({
      createAdapter: (_context, options) => {
        adapterOptions = options;
        return { status: "idle", start: (callback) => { onReady = callback; return vi.fn(); } };
      },
      createRepository: () => ({
        areaName: "local" as const,
        isAvailable: vi.fn(() => true),
        getResumeRecord: vi.fn(() => Promise.resolve(null)),
        saveResumeRecord: vi.fn(() => Promise.reject(new Error("save failed"))),
        deleteResumeRecord: vi.fn(() => Promise.resolve()),
        listResumeRecords: vi.fn(() => Promise.resolve([])),
        pruneResumeRecords: vi.fn(() => Promise.resolve({ pruned: 0, remaining: 0 }))
      }),
      createProgressTracker: vi.fn(() => tracker)
    }));

    await registry.mountAll(createExtensionContext({ logger }));
    onReady?.({ context: supportedContext, video: createVideo() });

    expect(() => adapterOptions?.onBeforeContextChange?.({ context: supportedContext, video: createVideo() })).not.toThrow();
    await registry.unmountAll();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith("watchdeck resume tracker flush failed", expect.any(Error));
    expect(logger.warn).toHaveBeenCalledWith("watchdeck resume tracker cleanup failed", expect.any(Error));
  });
});
