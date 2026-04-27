export type YoutubeAdapterStatus = "idle" | "ready";

export type {
  SupportedYoutubeWatchContext,
  UnsupportedYoutubeWatchContext,
  YoutubeUnsupportedReason,
  YoutubeWatchContext
} from "./watch-context";
export { getYoutubeContextKey, parseYoutubeWatchContext } from "./watch-context";

export interface YoutubeAdapter {
  readonly status: YoutubeAdapterStatus;
}

export function createYoutubeAdapter(): YoutubeAdapter {
  return { status: "idle" as YoutubeAdapterStatus };
}
