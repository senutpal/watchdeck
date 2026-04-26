export type YoutubeAdapterStatus = "idle" | "ready";

export interface YoutubeAdapter {
  readonly status: YoutubeAdapterStatus;
}

export function createYoutubeAdapter(): YoutubeAdapter {
  return { status: "idle" as YoutubeAdapterStatus };
}
