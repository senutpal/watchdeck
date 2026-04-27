import {
  waitForReadyYoutubePlayer,
  type SupportedYoutubeWatchContext,
  type YoutubeDiagnosticEvent
} from "../src/adapters/youtube";

const context: SupportedYoutubeWatchContext = {
  supported: true,
  videoId: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
};

type Listener = () => void;

class FakeVideo {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly removed: string[] = [];
  readyState = HTMLMediaElement.HAVE_METADATA;
  duration = 120;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)?.add(listener as Listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.removed.push(type);
    this.listeners.get(type)?.delete(listener as Listener);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  disconnected = false;

  constructor(private readonly callback: () => void) {
    FakeMutationObserver.instances.push(this);
  }

  observe(): void {
    // no-op for tests
  }

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.callback();
  }
}

function flush(): Promise<void> {
  return Promise.resolve();
}

describe("youtube player lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeMutationObserver.instances = [];
    vi.stubGlobal("HTMLMediaElement", { HAVE_METADATA: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves an existing ready finite video", async () => {
    const video = new FakeVideo();
    const events: YoutubeDiagnosticEvent[] = [];

    const handle = waitForReadyYoutubePlayer(context, {
      queryVideo: () => video as unknown as HTMLVideoElement,
      diagnostics: { emit: (event) => events.push(event) }
    });

    await expect(handle.promise).resolves.toEqual({ context, video });
    expect(events.map((event) => event.name)).toEqual(["player-ready"]);
  });

  it("rejects live or non-finite media as unsupported", async () => {
    for (const duration of [Infinity, Number.NaN, 0]) {
      const video = new FakeVideo();
      video.duration = duration;

      const handle = waitForReadyYoutubePlayer(context, {
        queryVideo: () => video as unknown as HTMLVideoElement,
        timeoutMs: 25
      });

      await vi.advanceTimersByTimeAsync(25);

      await expect(handle.promise).resolves.toBeNull();
      handle.cleanup();
    }
  });

  it("waits for mutation or media events until a video has metadata and finite duration", async () => {
    const video = new FakeVideo();
    video.readyState = 0;
    video.duration = Number.NaN;

    const events: YoutubeDiagnosticEvent[] = [];
    const handle = waitForReadyYoutubePlayer(context, {
      queryVideo: () => video as unknown as HTMLVideoElement,
      mutationObserver: FakeMutationObserver as unknown as typeof MutationObserver,
      observeTarget: {} as Node,
      diagnostics: { emit: (event) => events.push(event) }
    });

    await flush();
    expect(events.map((event) => event.name)).toEqual(["player-waiting"]);

    video.readyState = HTMLMediaElement.HAVE_METADATA;
    video.duration = 90;
    FakeMutationObserver.instances[0]?.trigger();

    await expect(handle.promise).resolves.toEqual({ context, video });
    expect(events.map((event) => event.name)).toEqual(["player-waiting", "player-ready"]);
  });

  it("disconnects observers and removes media listeners on cleanup", async () => {
    const video = new FakeVideo();
    video.readyState = 0;
    video.duration = Number.NaN;
    const events: YoutubeDiagnosticEvent[] = [];

    const handle = waitForReadyYoutubePlayer(context, {
      queryVideo: () => video as unknown as HTMLVideoElement,
      mutationObserver: FakeMutationObserver as unknown as typeof MutationObserver,
      observeTarget: {} as Node,
      diagnostics: { emit: (event) => events.push(event) }
    });

    handle.cleanup();
    handle.cleanup();

    await expect(handle.promise).resolves.toBeNull();
    expect(FakeMutationObserver.instances[0]?.disconnected).toBe(true);
    expect(video.removed).toEqual(["loadedmetadata", "durationchange"]);
    expect(events).toContainEqual({ name: "cleanup", details: { scope: "player" } });
    expect(events.filter((event) => event.name === "cleanup")).toHaveLength(1);
  });
});
