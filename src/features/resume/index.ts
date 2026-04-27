import type { WatchdeckFeature } from "../../core/feature-registry";
import type { ExtensionContext } from "../../core/extension-context";
import { createYoutubeAdapter, createYoutubeDiagnostics, type YoutubeAdapter } from "../../adapters/youtube";

export interface ResumeFeatureOptions {
  readonly createAdapter?: (context: ExtensionContext) => YoutubeAdapter;
}

export function createResumeFeature(options: ResumeFeatureOptions = {}): WatchdeckFeature {
  return {
    id: "resume",
    enabledByDefault: true,
    mount(context) {
      const adapter = options.createAdapter?.(context) ?? createYoutubeAdapter({
        diagnostics: createYoutubeDiagnostics(context)
      });

      return adapter.start((state) => {
        if (!context.debug) {
          return;
        }

        context.logger.debug("watchdeck resume runtime ready", {
          adapterStatus: adapter.status,
          videoId: state.context.videoId
        });
      });
    }
  };
}
