import { createExtensionContext } from "../core/extension-context";
import { createFeatureRegistry } from "../core/feature-registry";
import { createResumeFeature } from "../features/resume";

const DEBUG = false;

function debugLog(...data: unknown[]): void {
  if (DEBUG) {
    console.debug(...data);
  }
}

function bootstrapWatchdeck(): void {
  if (!location.hostname.endsWith("youtube.com")) {
    return;
  }

  const context = createExtensionContext({ debug: DEBUG });
  const registry = createFeatureRegistry();

  registry.register(createResumeFeature());
  void registry.mountAll(context).catch((error: unknown) => {
    if (context.debug) {
      context.logger.error("watchdeck feature mount failed", error);
    }
  });

  addEventListener("pagehide", () => {
    void registry.unmountAll().catch((error: unknown) => {
      if (context.debug) {
        context.logger.error("watchdeck feature cleanup failed", error);
      }
    });
  }, { once: true });

  debugLog("watchdeck content ready");
}

bootstrapWatchdeck();
