import { getYoutubeContextKey, parseYoutubeWatchContext } from "../src/adapters/youtube";

describe("youtube watch context", () => {
  it("classifies canonical watch URLs by video ID", () => {
    const context = parseYoutubeWatchContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(context).toMatchObject({
      supported: true,
      videoId: "dQw4w9WgXcQ"
    });
    expect(getYoutubeContextKey(context)).toBe("watch:dQw4w9WgXcQ");
  });

  it("supports relative watch URLs", () => {
    expect(parseYoutubeWatchContext("/watch?v=dQw4w9WgXcQ")).toMatchObject({
      supported: true,
      videoId: "dQw4w9WgXcQ"
    });
  });

  it("rejects watch pages with missing video IDs", () => {
    expect(parseYoutubeWatchContext("/watch")).toMatchObject({
      supported: false,
      reason: "missing-video-id"
    });
  });

  it("rejects watch pages with invalid video IDs", () => {
    expect(parseYoutubeWatchContext("/watch?v=bad")).toMatchObject({
      supported: false,
      reason: "invalid-video-id"
    });
  });

  it("classifies shorts as unsupported", () => {
    const context = parseYoutubeWatchContext("/shorts/dQw4w9WgXcQ");

    expect(context).toMatchObject({
      supported: false,
      reason: "shorts"
    });
    expect(getYoutubeContextKey(context)).toBe("unsupported:shorts:/shorts/dQw4w9WgXcQ");
  });

  it("classifies embeds as unsupported", () => {
    expect(parseYoutubeWatchContext("/embed/dQw4w9WgXcQ")).toMatchObject({
      supported: false,
      reason: "embed"
    });
  });

  it("classifies non-watch pages as unsupported", () => {
    expect(parseYoutubeWatchContext("/feed/subscriptions")).toMatchObject({
      supported: false,
      reason: "non-watch-page"
    });
  });

  it("classifies ad route markers as unsupported", () => {
    expect(parseYoutubeWatchContext("/watch?v=dQw4w9WgXcQ&ad=1")).toMatchObject({
      supported: false,
      reason: "ad"
    });
  });

  it("classifies live route markers as unsupported", () => {
    expect(parseYoutubeWatchContext("/watch?v=dQw4w9WgXcQ&eventType=live")).toMatchObject({
      supported: false,
      reason: "live"
    });
  });
});
