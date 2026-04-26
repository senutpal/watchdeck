import type { WatchdeckFeature } from "../../core/feature-registry";
import { createYoutubeAdapter } from "../../adapters/youtube";
import { createLocalStorageRepository } from "../../storage/local-storage-repository";

export function createResumeFeature(): WatchdeckFeature {
  return {
    id: "resume",
    enabledByDefault: true,
    mount(context) {
      const adapter = createYoutubeAdapter();
      const repository = createLocalStorageRepository();

      if (context.debug) {
        context.logger.debug("watchdeck resume boundary ready", {
          adapterStatus: adapter.status,
          storageArea: repository.areaName,
          storageAvailable: repository.isAvailable()
        });
      }
    }
  };
}
