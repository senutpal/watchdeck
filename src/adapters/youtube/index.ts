import type { YoutubeDiagnostics } from "./diagnostics";
import {
  createYoutubeNavigationObserver,
  type YoutubeNavigationObserver,
  type YoutubeNavigationObserverOptions
} from "./navigation-observer";
import {
  waitForReadyYoutubePlayer,
  type YoutubePlayerLifecycleHandle,
  type YoutubePlayerLifecycleOptions,
  type YoutubeRuntimeState
} from "./player-lifecycle";
import type { SupportedYoutubeWatchContext } from "./watch-context";

export type YoutubeAdapterStatus = "idle" | "ready";

export type {
  YoutubeNavigationObserver,
  YoutubeNavigationObserverOptions
} from "./navigation-observer";
export { createYoutubeNavigationObserver } from "./navigation-observer";

export type {
  YoutubePlayerLifecycleHandle,
  YoutubePlayerLifecycleOptions,
  YoutubeRuntimeState
} from "./player-lifecycle";
export { waitForReadyYoutubePlayer } from "./player-lifecycle";

export type {
  YoutubeDiagnosticEvent,
  YoutubeDiagnosticEventName,
  YoutubeDiagnostics
} from "./diagnostics";
export { createYoutubeDiagnostics } from "./diagnostics";

export type {
  SupportedYoutubeWatchContext,
  UnsupportedYoutubeWatchContext,
  YoutubeUnsupportedReason,
  YoutubeWatchContext
} from "./watch-context";
export { getYoutubeContextKey, parseYoutubeWatchContext } from "./watch-context";

export interface YoutubeAdapter {
  readonly status: YoutubeAdapterStatus;
  start(onReady?: (state: YoutubeRuntimeState) => void): () => void;
}

export interface YoutubeAdapterOptions {
  readonly diagnostics?: YoutubeDiagnostics;
  readonly navigationObserver?: YoutubeNavigationObserver;
  readonly navigationObserverOptions?: Omit<YoutubeNavigationObserverOptions, "diagnostics">;
  readonly onBeforeContextChange?: (state: YoutubeRuntimeState) => void | Promise<void>;
  readonly waitForReadyPlayer?: (
    context: SupportedYoutubeWatchContext,
    options?: YoutubePlayerLifecycleOptions
  ) => YoutubePlayerLifecycleHandle;
  readonly playerLifecycleOptions?: Omit<YoutubePlayerLifecycleOptions, "diagnostics">;
}

export function createYoutubeAdapter(options: YoutubeAdapterOptions = {}): YoutubeAdapter {
  let status: YoutubeAdapterStatus = "idle";

  return {
    get status() {
      return status;
    },

    start(onReady) {
      const navigationObserver = options.navigationObserver ?? createYoutubeNavigationObserver({
        ...options.navigationObserverOptions,
        diagnostics: options.diagnostics
      });
      const waitForReadyPlayer = options.waitForReadyPlayer ?? waitForReadyYoutubePlayer;
      let currentPlayerHandle: YoutubePlayerLifecycleHandle | undefined;
      let cleanupNavigation: (() => void) | undefined;
      let cleanedUp = false;
      let routeVersion = 0;
      let activeState: YoutubeRuntimeState | undefined;

      const notifyBeforeContextChange = () => {
        if (!activeState) {
          return;
        }

        const state = activeState;
        activeState = undefined;

        try {
          void Promise.resolve(options.onBeforeContextChange?.(state)).catch(() => undefined);
        } catch {
          // Feature-level cleanup must never block or break adapter routing.
        }
      };

      const cleanupPlayer = () => {
        notifyBeforeContextChange();
        currentPlayerHandle?.cleanup();
        currentPlayerHandle = undefined;
      };

      cleanupNavigation = navigationObserver.start((context) => {
        cleanupPlayer();
        status = "idle";
        routeVersion += 1;
        const version = routeVersion;

        if (!context.supported) {
          return;
        }

        const playerHandle = waitForReadyPlayer(context, {
          ...options.playerLifecycleOptions,
          diagnostics: options.diagnostics
        });
        currentPlayerHandle = playerHandle;

        playerHandle.promise.then((state) => {
          if (cleanedUp || version !== routeVersion || currentPlayerHandle !== playerHandle || !state) {
            return;
          }

          status = "ready";
          activeState = state;
          onReady?.(state);
        });
      });

      return () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        status = "idle";
        routeVersion += 1;
        cleanupNavigation?.();
        cleanupPlayer();
      };
    }
  };
}
