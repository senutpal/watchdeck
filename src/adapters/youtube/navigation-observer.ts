import type { YoutubeDiagnostics } from "./diagnostics";
import {
  getYoutubeContextKey,
  parseYoutubeWatchContext,
  type YoutubeWatchContext
} from "./watch-context";

export interface YoutubeNavigationObserverOptions {
  readonly readUrl?: () => string;
  readonly target?: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
  readonly pollIntervalMs?: number;
  readonly diagnostics?: YoutubeDiagnostics;
}

export interface YoutubeNavigationObserver {
  start(onContext: (context: YoutubeWatchContext) => void): () => void;
}

type NavigationEventName = "yt-navigate-finish" | "yt-page-data-updated" | "popstate";

const NAVIGATION_EVENTS: readonly NavigationEventName[] = ["yt-navigate-finish", "yt-page-data-updated", "popstate"];
const DEFAULT_POLL_INTERVAL_MS = 1000;

export function createYoutubeNavigationObserver(options: YoutubeNavigationObserverOptions = {}): YoutubeNavigationObserver {
  return {
    start(onContext) {
      const readUrl = options.readUrl ?? (() => location.href);
      const target = options.target ?? window;
      const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      let lastContextKey: string | undefined;
      let cleanedUp = false;

      const checkRoute = () => {
        if (cleanedUp) {
          return;
        }

        const context = parseYoutubeWatchContext(readUrl());
        const contextKey = getYoutubeContextKey(context);

        if (contextKey === lastContextKey) {
          return;
        }

        lastContextKey = contextKey;
        emitRouteDiagnostic(context, options.diagnostics);
        onContext(context);
      };

      const listeners = NAVIGATION_EVENTS.map((eventName) => {
        const listener = () => checkRoute();
        target.addEventListener(eventName, listener);
        return [eventName, listener] as const;
      });

      const intervalId = target.setInterval(checkRoute, pollIntervalMs);

      checkRoute();

      return () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;

        for (const [eventName, listener] of listeners) {
          target.removeEventListener(eventName, listener);
        }

        target.clearInterval(intervalId);
        options.diagnostics?.emit({ name: "cleanup", details: { scope: "navigation" } });
      };
    }
  };
}

function emitRouteDiagnostic(context: YoutubeWatchContext, diagnostics: YoutubeDiagnostics | undefined): void {
  if (context.supported) {
    diagnostics?.emit({
      name: "route-detected",
      details: { videoId: context.videoId, url: context.url }
    });
    return;
  }

  diagnostics?.emit({
    name: "route-unsupported",
    details: { reason: context.reason, url: context.url }
  });
}
