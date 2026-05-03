import { DEFAULT_SETTINGS, type WatchdeckSettings } from "./default-settings";

const SETTINGS_STORAGE_KEY = "watchdeck:settings:v1";

export interface SettingsRepository {
  getSettings(): Promise<WatchdeckSettings>;
  setResumeEnabled(enabled: boolean): Promise<WatchdeckSettings>;
  watchSettings(callback: (settings: WatchdeckSettings) => void): () => void;
}

export interface SettingsRepositoryOptions {
  readonly logger?: Pick<Console, "warn">;
}

type LocalStorageArea = Pick<chrome.storage.StorageArea, "get" | "set">;

function getStorage(): LocalStorageArea | null {
  return typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;
}

function getStorageChanges(): chrome.events.Event<(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void> | null {
  return typeof chrome !== "undefined" && chrome.storage?.onChanged ? chrome.storage.onChanged : null;
}

function isSettings(value: unknown): value is WatchdeckSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Record<string, unknown>;
  return typeof settings.resumeEnabled === "boolean" && typeof settings.debugLogging === "boolean";
}

function warn(logger: Pick<Console, "warn">, message: string, error: unknown): void {
  logger.warn(message, error);
}

export function createSettingsRepository(options: SettingsRepositoryOptions = {}): SettingsRepository {
  const logger = options.logger ?? console;

  async function getSettings(): Promise<WatchdeckSettings> {
    const storage = getStorage();
    if (!storage) {
      return DEFAULT_SETTINGS;
    }

    try {
      const stored = await storage.get(SETTINGS_STORAGE_KEY);
      const value = stored[SETTINGS_STORAGE_KEY];
      return isSettings(value) ? value : DEFAULT_SETTINGS;
    } catch (error) {
      warn(logger, "watchdeck failed to read settings", error);
      return DEFAULT_SETTINGS;
    }
  }

  return {
    getSettings,
    async setResumeEnabled(enabled) {
      const storage = getStorage();
      if (!storage) {
        return DEFAULT_SETTINGS;
      }

      const currentSettings = await getSettings();
      const nextSettings: WatchdeckSettings = {
        ...currentSettings,
        resumeEnabled: enabled
      };

      try {
        await storage.set({ [SETTINGS_STORAGE_KEY]: nextSettings });
        return nextSettings;
      } catch (error) {
        warn(logger, "watchdeck failed to save settings", error);
        return DEFAULT_SETTINGS;
      }
    },
    watchSettings(callback) {
      const changes = getStorageChanges();
      if (!changes) {
        return () => undefined;
      }

      const listener = (changedValues: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
        if (areaName !== "local" || !(SETTINGS_STORAGE_KEY in changedValues)) {
          return;
        }

        const value = changedValues[SETTINGS_STORAGE_KEY]?.newValue;
        callback(isSettings(value) ? value : DEFAULT_SETTINGS);
      };

      changes.addListener(listener);
      return () => {
        changes.removeListener(listener);
      };
    }
  };
}
