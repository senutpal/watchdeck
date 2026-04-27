import {
  createYoutubeNavigationObserver,
  type YoutubeDiagnosticEvent,
  type YoutubeWatchContext
} from "../src/adapters/youtube";

type Listener = (event?: Event) => void;

class FakeNavigationTarget {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly added: string[] = [];
  readonly removed: string[] = [];
  readonly intervals: Array<{ id: number; handler: () => void; ms: number }> = [];
  readonly cleared: number[] = [];

  private nextIntervalId = 1;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as Listener;
    this.added.push(type);

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)?.add(callback);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.removed.push(type);
    this.listeners.get(type)?.delete(listener as Listener);
  }

  setInterval(handler: () => void, ms?: number): number {
    const id = this.nextIntervalId;
    this.nextIntervalId += 1;
    this.intervals.push({ id, handler, ms: ms ?? 0 });
    return id;
  }

  clearInterval(id: number): void {
    this.cleared.push(id);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }

  tick(index = 0): void {
    this.intervals[index]?.handler();
  }
}

function videoIds(contexts: YoutubeWatchContext[]): string[] {
  return contexts
    .filter((context): context is YoutubeWatchContext & { supported: true } => context.supported)
    .map((context) => context.videoId);
}

describe("youtube navigation observer", () => {
  it("emits the current context immediately", () => {
    const target = new FakeNavigationTarget();
    const contexts: YoutubeWatchContext[] = [];

    createYoutubeNavigationObserver({
      readUrl: () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      target
    }).start((context) => contexts.push(context));

    expect(videoIds(contexts)).toEqual(["dQw4w9WgXcQ"]);
  });

  it("emits changed routes from youtube navigation events and popstate", () => {
    const target = new FakeNavigationTarget();
    const urls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=abcdefghijk",
      "https://www.youtube.com/watch?v=ZYXWVUTSRQP"
    ];
    let currentUrl = urls[0];
    const contexts: YoutubeWatchContext[] = [];

    createYoutubeNavigationObserver({ readUrl: () => currentUrl, target }).start((context) => contexts.push(context));

    currentUrl = urls[1];
    target.dispatch("yt-navigate-finish");

    currentUrl = urls[2];
    target.dispatch("popstate");

    expect(videoIds(contexts)).toEqual(["dQw4w9WgXcQ", "abcdefghijk", "ZYXWVUTSRQP"]);
    expect(target.added).toEqual(expect.arrayContaining(["yt-navigate-finish", "yt-page-data-updated", "popstate"]));
  });

  it("uses fallback polling to detect URL changes", () => {
    const target = new FakeNavigationTarget();
    let currentUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const contexts: YoutubeWatchContext[] = [];

    createYoutubeNavigationObserver({
      readUrl: () => currentUrl,
      target,
      pollIntervalMs: 250
    }).start((context) => contexts.push(context));

    currentUrl = "https://www.youtube.com/watch?v=abcdefghijk";
    target.tick();

    expect(videoIds(contexts)).toEqual(["dQw4w9WgXcQ", "abcdefghijk"]);
    expect(target.intervals).toEqual([{ id: 1, handler: expect.any(Function), ms: 250 }]);
  });

  it("dedupes repeated events for the same video", () => {
    const target = new FakeNavigationTarget();
    const contexts: YoutubeWatchContext[] = [];

    createYoutubeNavigationObserver({
      readUrl: () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
      target
    }).start((context) => contexts.push(context));

    target.dispatch("yt-navigate-finish");
    target.dispatch("yt-page-data-updated");
    target.dispatch("popstate");
    target.tick();

    expect(videoIds(contexts)).toEqual(["dQw4w9WgXcQ"]);
  });

  it("emits route diagnostics for supported and unsupported contexts", () => {
    const target = new FakeNavigationTarget();
    const events: YoutubeDiagnosticEvent[] = [];
    let currentUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    createYoutubeNavigationObserver({
      readUrl: () => currentUrl,
      target,
      diagnostics: { emit: (event) => events.push(event) }
    }).start(() => undefined);

    currentUrl = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    target.dispatch("yt-navigate-finish");

    expect(events.map((event) => event.name)).toEqual(["route-detected", "route-unsupported"]);
  });

  it("removes every navigation listener and clears the fallback interval on cleanup", () => {
    const target = new FakeNavigationTarget();
    const cleanup = createYoutubeNavigationObserver({
      readUrl: () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      target
    }).start(() => undefined);

    cleanup();

    expect(target.removed).toEqual(["yt-navigate-finish", "yt-page-data-updated", "popstate"]);
    expect(target.cleared).toEqual([1]);
  });

  it("makes cleanup idempotent and stops later route callbacks", () => {
    const target = new FakeNavigationTarget();
    const contexts: YoutubeWatchContext[] = [];
    let currentUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    const cleanup = createYoutubeNavigationObserver({ readUrl: () => currentUrl, target }).start((context) => {
      contexts.push(context);
    });

    cleanup();
    cleanup();

    currentUrl = "https://www.youtube.com/watch?v=abcdefghijk";
    target.dispatch("yt-navigate-finish");
    target.tick();

    expect(videoIds(contexts)).toEqual(["dQw4w9WgXcQ"]);
    expect(target.removed).toEqual(["yt-navigate-finish", "yt-page-data-updated", "popstate"]);
    expect(target.cleared).toEqual([1]);
  });

  it("emits a navigation cleanup diagnostic once", () => {
    const target = new FakeNavigationTarget();
    const events: YoutubeDiagnosticEvent[] = [];
    const cleanup = createYoutubeNavigationObserver({
      readUrl: () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      target,
      diagnostics: { emit: (event) => events.push(event) }
    }).start(() => undefined);

    cleanup();
    cleanup();

    expect(events).toContainEqual({ name: "cleanup", details: { scope: "navigation" } });
    expect(events.filter((event) => event.name === "cleanup")).toHaveLength(1);
  });
});
