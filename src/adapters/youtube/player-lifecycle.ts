import type { YoutubeDiagnostics } from "./diagnostics";
import type { SupportedYoutubeWatchContext } from "./watch-context";

export interface YoutubeRuntimeState {
  readonly context: SupportedYoutubeWatchContext;
  readonly video: HTMLVideoElement;
}

export interface YoutubePlayerLifecycleOptions {
  readonly queryVideo?: () => HTMLVideoElement | null;
  readonly timeoutMs?: number;
  readonly diagnostics?: YoutubeDiagnostics;
  readonly mutationObserver?: typeof MutationObserver;
  readonly observeTarget?: Node;
}

export interface YoutubePlayerLifecycleHandle {
  readonly promise: Promise<YoutubeRuntimeState | null>;
  readonly cleanup: () => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MEDIA_EVENTS = ["loadedmetadata", "durationchange"] as const;

export function waitForReadyYoutubePlayer(
  context: SupportedYoutubeWatchContext,
  options: YoutubePlayerLifecycleOptions = {}
): YoutubePlayerLifecycleHandle {
  const queryVideo = options.queryVideo ?? (() => document.querySelector("video") as HTMLVideoElement | null);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const MutationObserverCtor = options.mutationObserver ?? globalThis.MutationObserver;
  const observeTarget = options.observeTarget ?? globalThis.document?.documentElement;
  let activeVideo: HTMLVideoElement | null = null;
  let cleanedUp = false;
  let settled = false;
  let waitingEmitted = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  let resolvePromise: (state: YoutubeRuntimeState | null) => void = () => undefined;

  const promise = new Promise<YoutubeRuntimeState | null>((resolve) => {
    resolvePromise = resolve;
  });

  const settle = (state: YoutubeRuntimeState | null) => {
    if (settled) {
      return;
    }

    settled = true;
    removeMediaListeners();
    observer?.disconnect();

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    if (state) {
      options.diagnostics?.emit({
        name: "player-ready",
        details: { scope: "player", videoId: state.context.videoId, readyState: state.video.readyState, duration: state.video.duration }
      });
    }

    resolvePromise(state);
  };

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    options.diagnostics?.emit({ name: "cleanup", details: { scope: "player" } });
    settle(null);
  };

  const check = () => {
    if (cleanedUp || settled) {
      return;
    }

    const video = queryVideo();

    if (!video) {
      emitWaiting();
      return;
    }

    trackVideo(video, check);

    if (isReadyYoutubeVideo(video)) {
      settle({ context, video });
      return;
    }

    if (hasMetadata(video) && !hasFinitePositiveDuration(video)) {
      settle(null);
      return;
    }

    emitWaiting();
  };

  if (typeof MutationObserverCtor === "function" && observeTarget) {
    observer = new MutationObserverCtor(check);
    observer.observe(observeTarget, { childList: true, subtree: true });
  }

  timeoutId = setTimeout(() => settle(null), timeoutMs);
  check();

  return { promise, cleanup };

  function emitWaiting(): void {
    if (waitingEmitted) {
      return;
    }

    waitingEmitted = true;
    options.diagnostics?.emit({ name: "player-waiting", details: { scope: "player", videoId: context.videoId } });
  }

  function trackVideo(video: HTMLVideoElement, listener: EventListener): void {
    if (activeVideo === video) {
      return;
    }

    removeMediaListeners();
    activeVideo = video;

    for (const eventName of MEDIA_EVENTS) {
      activeVideo.addEventListener(eventName, listener);
    }
  }

  function removeMediaListeners(): void {
    if (!activeVideo) {
      return;
    }

    for (const eventName of MEDIA_EVENTS) {
      activeVideo.removeEventListener(eventName, check);
    }

    activeVideo = null;
  }
}

function isReadyYoutubeVideo(video: HTMLVideoElement): boolean {
  return hasMetadata(video) && hasFinitePositiveDuration(video);
}

function hasMetadata(video: HTMLVideoElement): boolean {
  return video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

function hasFinitePositiveDuration(video: HTMLVideoElement): boolean {
  return Number.isFinite(video.duration) && video.duration > 0;
}
