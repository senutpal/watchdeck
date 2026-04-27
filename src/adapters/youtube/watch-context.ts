export type YoutubeUnsupportedReason = "non-watch-page" | "missing-video-id" | "invalid-video-id" | "shorts" | "embed" | "ad" | "live";

export interface SupportedYoutubeWatchContext {
  readonly supported: true;
  readonly videoId: string;
  readonly url: string;
}

export interface UnsupportedYoutubeWatchContext {
  readonly supported: false;
  readonly reason: YoutubeUnsupportedReason;
  readonly url: string;
}

export type YoutubeWatchContext = SupportedYoutubeWatchContext | UnsupportedYoutubeWatchContext;

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function parseYoutubeWatchContext(input: string | URL | Location): YoutubeWatchContext {
  const url = toYoutubeUrl(input);

  if (isShortsPath(url)) {
    return unsupported(url, "shorts");
  }

  if (isEmbedPath(url)) {
    return unsupported(url, "embed");
  }

  if (isAdUrl(url)) {
    return unsupported(url, "ad");
  }

  if (isLiveUrl(url)) {
    return unsupported(url, "live");
  }

  if (url.pathname !== "/watch") {
    return unsupported(url, "non-watch-page");
  }

  const videoId = url.searchParams.get("v");

  if (videoId === null || videoId === "") {
    return unsupported(url, "missing-video-id");
  }

  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return unsupported(url, "invalid-video-id");
  }

  return {
    supported: true,
    videoId,
    url: url.href
  };
}

export function getYoutubeContextKey(context: YoutubeWatchContext): string {
  if (context.supported) {
    return `watch:${context.videoId}`;
  }

  return `unsupported:${context.reason}:${new URL(context.url).pathname}`;
}

function toYoutubeUrl(input: string | URL | Location): URL {
  try {
    return new URL(input.toString(), "https://www.youtube.com");
  } catch {
    return new URL("/", "https://www.youtube.com");
  }
}

function unsupported(url: URL, reason: YoutubeUnsupportedReason): UnsupportedYoutubeWatchContext {
  return {
    supported: false,
    reason,
    url: url.href
  };
}

function isShortsPath(url: URL): boolean {
  return url.pathname === "/shorts" || url.pathname.startsWith("/shorts/");
}

function isEmbedPath(url: URL): boolean {
  return url.pathname === "/embed" || url.pathname.startsWith("/embed/");
}

function isAdUrl(url: URL): boolean {
  const adMarkers = ["ad", "ads", "adformat", "adunit", "adurl"];
  const pathSegments = url.pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());

  if (pathSegments.some((segment) => adMarkers.includes(segment))) {
    return true;
  }

  return Array.from(url.searchParams.keys()).some((key) => adMarkers.includes(key.toLowerCase()));
}

function isLiveUrl(url: URL): boolean {
  const pathSegments = url.pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());

  if (pathSegments.includes("live")) {
    return true;
  }

  return url.searchParams.get("live") === "1"
    || url.searchParams.get("is_live") === "1"
    || url.searchParams.get("eventType") === "live";
}
