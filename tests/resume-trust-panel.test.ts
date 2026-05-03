import { createResumeTrustPanel } from "../src/features/resume/trust-panel";
import type { SettingsRepository } from "../src/settings/settings-repository";
import type { LocalStorageRepository } from "../src/storage/local-storage-repository";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<(event: Event) => void>>();
  parentElement: FakeElement | null = null;
  id = "";
  textContent = "";
  type = "";
  checked = false;
  disabled = false;

  constructor(readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }

    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  }
}

class FakeDocument {
  readonly body = new FakeElement("body");

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  getElementById(id: string): FakeElement | null {
    return findElement(this.body, (element) => element.id === id);
  }
}

function findElement(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement | null {
  if (predicate(root)) {
    return root;
  }

  for (const child of root.children) {
    const match = findElement(child, predicate);
    if (match) {
      return match;
    }
  }

  return null;
}

function findElements(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement[] {
  return [
    ...(predicate(root) ? [root] : []),
    ...root.children.flatMap((child) => findElements(child, predicate))
  ];
}

function textOf(element: FakeElement): string {
  return [element.textContent, ...element.children.map(textOf)].join(" ");
}

function getButton(root: FakeElement, text: string): FakeElement {
  const button = findElement(root, (element) => element.tagName === "button" && element.textContent === text);
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

function createSettingsRepository(overrides: Partial<SettingsRepository> = {}): SettingsRepository {
  return {
    getSettings: vi.fn(() => Promise.resolve({ resumeEnabled: true, debugLogging: false })),
    setResumeEnabled: vi.fn((resumeEnabled: boolean) => Promise.resolve({ resumeEnabled, debugLogging: false })),
    watchSettings: vi.fn(() => vi.fn()),
    ...overrides
  };
}

function createResumeRepository(
  overrides: Partial<Pick<LocalStorageRepository, "deleteResumeRecord" | "clearResumeRecords">> = {}
): Pick<LocalStorageRepository, "deleteResumeRecord" | "clearResumeRecords"> {
  return {
    deleteResumeRecord: vi.fn(() => Promise.resolve()),
    clearResumeRecords: vi.fn(() => Promise.resolve(0)),
    ...overrides
  };
}

async function drainAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("resume trust panel", () => {
  it("renders exactly one local-only controls panel", () => {
    const root = new FakeDocument();

    createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository: createResumeRepository()
    });
    createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository: createResumeRepository()
    });

    const panels = findElements(root.body, (element) => element.id === "watchdeck-resume-controls");
    expect(panels).toHaveLength(1);
    expect(textOf(panels[0])).toContain("watchdeck");
    expect(textOf(panels[0])).toContain("Resume videos automatically");
    expect(textOf(panels[0])).toContain("Resume data stays on this browser. v1 does not sync or upload it.");
  });

  it("uses an aria-live status region and idempotent cleanup", () => {
    const root = new FakeDocument();
    const panel = createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository: createResumeRepository()
    });
    const status = findElement(root.body, (element) => element.getAttribute("role") === "status");

    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("Open a YouTube video to clear its saved progress.");

    panel.cleanup();
    panel.cleanup();

    expect(root.getElementById("watchdeck-resume-controls")).toBeNull();
  });

  it("updates resume settings from the checkbox", async () => {
    const root = new FakeDocument();
    const settingsRepository = createSettingsRepository();
    createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository,
      resumeRepository: createResumeRepository()
    });
    const checkbox = findElement(root.body, (element) => element.tagName === "input");

    if (!checkbox) {
      throw new Error("Missing checkbox");
    }
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    await drainAsyncWork();

    expect(settingsRepository.setResumeEnabled).toHaveBeenCalledWith(false);
    expect(checkbox.checked).toBe(false);
  });

  it("clears saved progress for the current video", async () => {
    const root = new FakeDocument();
    const resumeRepository = createResumeRepository();
    const panel = createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository
    });

    panel.setCurrentVideoId("dQw4w9WgXcQ");
    getButton(root.body, "Clear this video").dispatchEvent(new Event("click"));
    await drainAsyncWork();

    expect(resumeRepository.deleteResumeRecord).toHaveBeenCalledWith("dQw4w9WgXcQ");
    expect(textOf(root.body)).toContain("Saved progress cleared for this video.");
  });

  it("keeps current-video clearing disabled without a video id", () => {
    const root = new FakeDocument();
    createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository: createResumeRepository()
    });

    expect(getButton(root.body, "Clear this video").disabled).toBe(true);
    expect(textOf(root.body)).toContain("Open a YouTube video to clear its saved progress.");
  });

  it("clears all resume data and shows count-based status", async () => {
    const root = new FakeDocument();
    const resumeRepository = createResumeRepository({ clearResumeRecords: vi.fn(() => Promise.resolve(2)) });
    createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository
    });

    getButton(root.body, "Clear all resume data").dispatchEvent(new Event("click"));
    await drainAsyncWork();

    expect(resumeRepository.clearResumeRecords).toHaveBeenCalledTimes(1);
    expect(textOf(root.body)).toContain("Cleared 2 saved resume records.");
  });

  it("shows a safe failure status when control actions fail", async () => {
    const root = new FakeDocument();
    createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository({
        setResumeEnabled: vi.fn(() => Promise.reject(new Error("failed")))
      }),
      resumeRepository: createResumeRepository()
    });
    const checkbox = findElement(root.body, (element) => element.tagName === "input");

    checkbox?.dispatchEvent(new Event("change"));
    await drainAsyncWork();

    expect(textOf(root.body)).toContain("watchdeck could not update controls. YouTube playback is unaffected.");
  });

  it("formats auto-resume status as minutes and seconds", () => {
    const root = new FakeDocument();
    const panel = createResumeTrustPanel({
      root: root as unknown as Document,
      settingsRepository: createSettingsRepository(),
      resumeRepository: createResumeRepository()
    });

    panel.showAutoResumed(754);

    expect(textOf(root.body)).toContain("Auto-resumed to 12:34.");
  });
});
