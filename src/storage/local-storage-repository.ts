export interface LocalStorageRepository {
  readonly areaName: "local";
  isAvailable(): boolean;
}

export function createLocalStorageRepository(): LocalStorageRepository {
  return {
    areaName: "local",
    isAvailable() {
      return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
    }
  };
}
