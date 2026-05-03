import type { SettingsRepository } from "../../settings/settings-repository";
import type { LocalStorageRepository } from "../../storage/local-storage-repository";

const PANEL_ID = "watchdeck-resume-controls";
const LOCAL_ONLY_COPY = "Resume data stays on this browser. v1 does not sync or upload it.";
const NO_VIDEO_HELPER = "Open a YouTube video to clear its saved progress.";
const CONTROL_FAILURE_STATUS = "watchdeck could not update controls. YouTube playback is unaffected.";

export interface ResumeTrustPanel {
  setCurrentVideoId(videoId: string | null): void;
  setResumeEnabled(enabled: boolean): void;
  showStatus(message: string): void;
  showAutoResumed(targetSeconds: number): void;
  cleanup(): void;
}

export interface ResumeTrustPanelOptions {
  readonly root: Pick<Document, "body" | "createElement" | "getElementById">;
  readonly settingsRepository: SettingsRepository;
  readonly resumeRepository: Pick<LocalStorageRepository, "deleteResumeRecord" | "clearResumeRecords">;
}

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function formatSeconds(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = String(normalizedSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function createResumeTrustPanel(options: ResumeTrustPanelOptions): ResumeTrustPanel {
  options.root.getElementById(PANEL_ID)?.remove();

  const container = options.root.createElement("section");
  container.id = PANEL_ID;
  container.setAttribute("aria-label", "watchdeck resume controls");
  setStyles(container, {
    position: "fixed",
    right: "16px",
    bottom: "18px",
    width: "280px",
    boxSizing: "border-box",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(18,18,18,0.86)",
    color: "rgba(255,255,255,0.88)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    fontSize: "12px",
    lineHeight: "1.4",
    zIndex: "2147483647",
    boxShadow: "0 8px 28px rgba(0,0,0,0.28)"
  });

  const title = options.root.createElement("div");
  title.textContent = "watchdeck";
  setStyles(title, { fontSize: "13px", fontWeight: "700", marginBottom: "4px" });

  const trustLine = options.root.createElement("p");
  trustLine.textContent = LOCAL_ONLY_COPY;
  setStyles(trustLine, { margin: "0 0 10px", color: "rgba(255,255,255,0.66)" });

  const toggleLabel = options.root.createElement("label");
  setStyles(toggleLabel, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
    cursor: "pointer"
  });

  const checkbox = options.root.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;

  const toggleText = options.root.createElement("span");
  toggleText.textContent = "Resume videos automatically";

  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(toggleText);

  const buttonRow = options.root.createElement("div");
  setStyles(buttonRow, { display: "flex", gap: "8px", marginBottom: "8px" });

  const clearCurrentButton = options.root.createElement("button");
  clearCurrentButton.type = "button";
  clearCurrentButton.textContent = "Clear this video";
  clearCurrentButton.disabled = true;

  const clearAllButton = options.root.createElement("button");
  clearAllButton.type = "button";
  clearAllButton.textContent = "Clear all resume data";

  for (const button of [clearCurrentButton, clearAllButton]) {
    setStyles(button, {
      flex: "1 1 0",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "9px",
      padding: "7px 8px",
      background: "rgba(255,255,255,0.08)",
      color: "rgba(255,255,255,0.86)",
      font: "inherit",
      cursor: "pointer"
    });
  }

  buttonRow.appendChild(clearCurrentButton);
  buttonRow.appendChild(clearAllButton);

  const status = options.root.createElement("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = NO_VIDEO_HELPER;
  setStyles(status, { minHeight: "17px", color: "rgba(255,255,255,0.62)" });

  container.appendChild(title);
  container.appendChild(trustLine);
  container.appendChild(toggleLabel);
  container.appendChild(buttonRow);
  container.appendChild(status);
  options.root.body.appendChild(container);

  let currentVideoId: string | null = null;
  let cleanedUp = false;

  const showStatus = (message: string): void => {
    status.textContent = message;
  };

  const handleToggleChange = (): void => {
    void options.settingsRepository.setResumeEnabled(checkbox.checked)
      .then((settings) => {
        checkbox.checked = settings.resumeEnabled;
      })
      .catch(() => {
        showStatus(CONTROL_FAILURE_STATUS);
      });
  };

  const handleClearCurrent = (): void => {
    if (!currentVideoId) {
      showStatus(NO_VIDEO_HELPER);
      return;
    }

    void options.resumeRepository.deleteResumeRecord(currentVideoId)
      .then(() => {
        showStatus("Saved progress cleared for this video.");
      })
      .catch(() => {
        showStatus(CONTROL_FAILURE_STATUS);
      });
  };

  const handleClearAll = (): void => {
    void options.resumeRepository.clearResumeRecords()
      .then((count) => {
        showStatus(count > 0 ? `Cleared ${count} saved resume records.` : "All saved resume progress cleared.");
      })
      .catch(() => {
        showStatus(CONTROL_FAILURE_STATUS);
      });
  };

  checkbox.addEventListener("change", handleToggleChange);
  clearCurrentButton.addEventListener("click", handleClearCurrent);
  clearAllButton.addEventListener("click", handleClearAll);

  return {
    setCurrentVideoId(videoId) {
      currentVideoId = videoId;
      clearCurrentButton.disabled = !videoId;

      if (!videoId) {
        showStatus(NO_VIDEO_HELPER);
      } else if (status.textContent === NO_VIDEO_HELPER) {
        showStatus("");
      }
    },
    setResumeEnabled(enabled) {
      checkbox.checked = enabled;
    },
    showStatus,
    showAutoResumed(targetSeconds) {
      showStatus(`Auto-resumed to ${formatSeconds(targetSeconds)}.`);
    },
    cleanup() {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      checkbox.removeEventListener("change", handleToggleChange);
      clearCurrentButton.removeEventListener("click", handleClearCurrent);
      clearAllButton.removeEventListener("click", handleClearAll);
      container.remove();
    }
  };
}
