import { createSettingsRepository } from "../settings/settings-repository";
import { createLocalStorageRepository } from "../storage/local-storage-repository";

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;

interface ActiveTabContext {
  readonly videoId: string | null;
  readonly title: string | null;
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return { videoId: null, title: null };
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const url = tab?.url;
    if (!url) return { videoId: null, title: null };
    const parsed = new URL(url);
    if (parsed.hostname !== "www.youtube.com") return { videoId: null, title: null };
    if (parsed.pathname !== "/watch") return { videoId: null, title: null };
    const videoId = parsed.searchParams.get("v");
    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return { videoId: null, title: null };
    const rawTitle = tab?.title?.trim() ?? null;
    const title = rawTitle ? rawTitle.replace(/\s*[-—–]\s*YouTube$/i, "").trim() : null;
    return { videoId, title: title && title.length > 0 ? title : null };
  } catch {
    return { videoId: null, title: null };
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`watchdeck popup: missing #${id}`);
  return node as T;
}

async function init(): Promise<void> {
  const settings = createSettingsRepository();
  const resume = createLocalStorageRepository();

  const toggle = el<HTMLInputElement>("resume-toggle");
  const clearCurrent = el<HTMLButtonElement>("clear-current");
  const clearAll = el<HTMLButtonElement>("clear-all");
  const status = el<HTMLDivElement>("status");
  const brandState = el<HTMLSpanElement>("brand-state");
  const nowWatching = el<HTMLElement>("now-watching");
  const nowWatchingTitle = el<HTMLParagraphElement>("now-watching-title");
  const confirmBox = el<HTMLElement>("confirm");
  const confirmText = el<HTMLParagraphElement>("confirm-text");
  const confirmYes = el<HTMLButtonElement>("confirm-yes");
  const confirmCancel = el<HTMLButtonElement>("confirm-cancel");

  const setStatus = (message: string): void => {
    status.textContent = message;
  };

  const setBrandState = (enabled: boolean): void => {
    brandState.textContent = enabled ? "Resuming" : "Off";
    brandState.dataset.state = enabled ? "on" : "off";
  };

  const initialSettings = await settings.getSettings();
  toggle.checked = initialSettings.resumeEnabled;
  setBrandState(initialSettings.resumeEnabled);

  const { videoId, title } = await getActiveTabContext();
  if (videoId) {
    nowWatching.classList.add("is-visible");
    nowWatchingTitle.textContent = title ?? `Video · ${videoId}`;
    clearCurrent.disabled = false;
  } else {
    nowWatching.classList.remove("is-visible");
    clearCurrent.disabled = true;
    setStatus("Open a YouTube video to clear its saved progress.");
  }

  toggle.addEventListener("change", async () => {
    try {
      const next = await settings.setResumeEnabled(toggle.checked);
      toggle.checked = next.resumeEnabled;
      setBrandState(next.resumeEnabled);
      setStatus(next.resumeEnabled ? "Auto-resume on." : "Auto-resume off.");
    } catch {
      setStatus("WatchDeck could not update controls.");
    }
  });

  clearCurrent.addEventListener("click", async () => {
    if (!videoId) return;
    try {
      await resume.deleteResumeRecord(videoId);
      setStatus("Saved progress cleared for this video.");
      clearCurrent.disabled = true;
    } catch {
      setStatus("Could not clear this video.");
    }
  });

  let confirmCount = 0;
  const hideConfirm = (): void => {
    confirmBox.classList.remove("is-visible");
  };

  clearAll.addEventListener("click", () => {
    confirmCount = 0;
    confirmText.textContent = "Erase all saved resume data?";
    confirmBox.classList.add("is-visible");
    confirmYes.focus();
  });

  confirmCancel.addEventListener("click", () => {
    hideConfirm();
  });

  confirmYes.addEventListener("click", async () => {
    hideConfirm();
    try {
      const count = await resume.clearResumeRecords();
      confirmCount = count;
      setStatus(count > 0 ? `Cleared ${count} saved video${count === 1 ? "" : "s"}.` : "No saved progress to clear.");
      clearCurrent.disabled = true;
    } catch {
      setStatus("Could not clear saved data.");
    }
  });

  void confirmCount;
}

void init().catch((error) => {
  console.error("watchdeck popup init failed", error);
});
