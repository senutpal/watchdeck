import { createYoutubeAdapter, type SupportedYoutubeWatchContext } from "../src/adapters/youtube";
import { createExtensionContext } from "../src/core/extension-context";
import { createFeatureRegistry } from "../src/core/feature-registry";
import { createResumeFeature } from "../src/features/resume";

const supportedContext: SupportedYoutubeWatchContext = {
  supported: true,
  videoId: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
};

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
    let emitContext: ((context: Parameters<Parameters<typeof createYoutubeAdapter>[0]["navigationObserver"]["start"]>[0]) => void) | undefined;

    const adapter = createYoutubeAdapter({
      navigationObserver: {
        start(callback) {
          emitContext = callback;
          return vi.fn();
        }
      },
      waitForReadyPlayer: vi.fn(() => ({
        promise: new Promise(() => undefined),
        cleanup: playerCleanup
      }))
    });

    adapter.start();
    emitContext?.(supportedContext);
    emitContext?.({ supported: false, reason: "non-watch-page", url: "https://www.youtube.com/" });

    expect(playerCleanup).toHaveBeenCalledTimes(1);
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
});
