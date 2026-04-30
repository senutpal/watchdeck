import type { WatchdeckFeature } from "../../core/feature-registry";
import type { ExtensionContext } from "../../core/extension-context";
import {
  createYoutubeAdapter,
  createYoutubeDiagnostics,
  type YoutubeAdapter,
  type YoutubeAdapterOptions
} from "../../adapters/youtube";
import { createAutoResumeController, type AutoResumeController, type AutoResumeControllerOptions } from "./resume-controller";
import { createResumeProgressTracker, type ResumeProgressTracker, type ResumeProgressTrackerOptions } from "./progress-tracker";
import { createLocalStorageRepository, type LocalStorageRepository } from "../../storage/local-storage-repository";

export interface ResumeFeatureOptions {
  readonly createAdapter?: (context: ExtensionContext, options: YoutubeAdapterOptions) => YoutubeAdapter;
  readonly createRepository?: (context: ExtensionContext) => LocalStorageRepository;
  readonly createAutoResumeController?: (options: AutoResumeControllerOptions) => AutoResumeController;
  readonly createProgressTracker?: (options: ResumeProgressTrackerOptions) => ResumeProgressTracker;
}

export function createResumeFeature(options: ResumeFeatureOptions = {}): WatchdeckFeature {
  return {
    id: "resume",
    enabledByDefault: true,
    mount(context) {
      const repository = options.createRepository?.(context) ?? createLocalStorageRepository({ logger: context.logger });
      const createController = options.createAutoResumeController ?? createAutoResumeController;
      const createProgressTracker = options.createProgressTracker ?? createResumeProgressTracker;
      let activeController: AutoResumeController | undefined;
      let activeTracker: ResumeProgressTracker | undefined;
      let contextVersion = 0;

      const stopActiveAutoResumeController = async (): Promise<void> => {
        const controller = activeController;
        activeController = undefined;

        if (!controller) {
          return;
        }

        try {
          await controller.cleanup();
        } catch (error) {
          context.logger.warn("watchdeck auto resume cleanup failed", error);
        }
      };

      const stopActiveTracker = async (): Promise<void> => {
        const tracker = activeTracker;
        activeTracker = undefined;

        if (!tracker) {
          return;
        }

        try {
          await tracker.flush();
        } catch (error) {
          context.logger.warn("watchdeck resume tracker flush failed", error);
        }

        try {
          await tracker.cleanup();
        } catch (error) {
          context.logger.warn("watchdeck resume tracker cleanup failed", error);
        }
      };

      const adapterOptions: YoutubeAdapterOptions = {
        diagnostics: createYoutubeDiagnostics(context),
        onBeforeContextChange: () => {
          contextVersion += 1;
          void stopActiveAutoResumeController();
          void stopActiveTracker();
        }
      };
      const adapter = options.createAdapter?.(context, adapterOptions) ?? createYoutubeAdapter(adapterOptions);

      const cleanupAdapter = adapter.start((state) => {
        contextVersion += 1;
        const readyVersion = contextVersion;

        void stopActiveAutoResumeController();
        void stopActiveTracker();

        const startProgressTracker = (): void => {
          if (readyVersion !== contextVersion) {
            return;
          }

          activeTracker = createProgressTracker({
            videoId: state.context.videoId,
            video: state.video,
            saveResumeRecord: repository.saveResumeRecord,
            now: context.now,
            logger: context.logger
          });
        };

        activeController = createController({
          videoId: state.context.videoId,
          video: state.video,
          getResumeRecord: repository.getResumeRecord,
          logger: context.logger,
          onSettled: startProgressTracker
        });

        if (!context.debug) {
          return;
        }

        context.logger.debug("watchdeck resume runtime ready", {
          adapterStatus: adapter.status,
          videoId: state.context.videoId
        });
      });

      return () => {
        contextVersion += 1;
        cleanupAdapter();
        void stopActiveAutoResumeController();
        void stopActiveTracker();
      };
    }
  };
}
