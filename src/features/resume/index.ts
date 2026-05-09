import type { WatchdeckFeature } from "../../core/feature-registry";
import type { ExtensionContext } from "../../core/extension-context";
import {
  createYoutubeAdapter,
  createYoutubeDiagnostics,
  type YoutubeAdapter,
  type YoutubeAdapterOptions,
  type YoutubeRuntimeState
} from "../../adapters/youtube";
import { createAutoResumeController, type AutoResumeController, type AutoResumeControllerOptions } from "./resume-controller";
import { createResumeProgressTracker, type ResumeProgressTracker, type ResumeProgressTrackerOptions } from "./progress-tracker";
import { createLocalStorageRepository, type LocalStorageRepository } from "../../storage/local-storage-repository";
import { DEFAULT_SETTINGS } from "../../settings/default-settings";
import {
  createSettingsRepository as createDefaultSettingsRepository,
  type SettingsRepository
} from "../../settings/settings-repository";
import type { ResumeTrustPanel, ResumeTrustPanelOptions } from "./trust-panel";

export interface ResumeFeatureOptions {
  readonly createAdapter?: (context: ExtensionContext, options: YoutubeAdapterOptions) => YoutubeAdapter;
  readonly createRepository?: (context: ExtensionContext) => LocalStorageRepository;
  readonly createSettingsRepository?: (context: ExtensionContext) => SettingsRepository;
  readonly createTrustPanel?: (options: ResumeTrustPanelOptions) => ResumeTrustPanel;
  readonly createAutoResumeController?: (options: AutoResumeControllerOptions) => AutoResumeController;
  readonly createProgressTracker?: (options: ResumeProgressTrackerOptions) => ResumeProgressTracker;
}

export function createResumeFeature(options: ResumeFeatureOptions = {}): WatchdeckFeature {
  return {
    id: "resume",
    enabledByDefault: true,
    mount(context) {
      const repository = options.createRepository?.(context) ?? createLocalStorageRepository({ logger: context.logger });
      const settingsRepository = options.createSettingsRepository?.(context)
        ?? createDefaultSettingsRepository({ logger: context.logger });
      const panel = typeof document !== "undefined"
        ? options.createTrustPanel?.({ root: document, settingsRepository, resumeRepository: repository })
        : undefined;
      const createController = options.createAutoResumeController ?? createAutoResumeController;
      const createProgressTracker = options.createProgressTracker ?? createResumeProgressTracker;
      let activeController: AutoResumeController | undefined;
      let activeTracker: ResumeProgressTracker | undefined;
      let contextVersion = 0;
      let cleanupSettingsWatcher: (() => void) | undefined;
      let cleanedUp = false;
      let settingsReady = false;
      let resumeEnabled = DEFAULT_SETTINGS.resumeEnabled;
      let latestReadyState: YoutubeRuntimeState | undefined;

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

      const startRuntimeForReadyState = (state: YoutubeRuntimeState): void => {
        contextVersion += 1;
        const readyVersion = contextVersion;
        latestReadyState = state;
        panel?.setCurrentVideoId(state.context.videoId);

        void stopActiveAutoResumeController();
        void stopActiveTracker();

        if (!settingsReady || !resumeEnabled) {
          return;
        }

        const startProgressTracker = (): void => {
          if (readyVersion !== contextVersion || !resumeEnabled) {
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
          onResumeApplied: (targetSeconds) => panel?.showAutoResumed(targetSeconds),
          onSettled: startProgressTracker
        });

        if (!context.debug) {
          return;
        }

        context.logger.debug("watchdeck resume runtime ready", {
          adapterStatus: adapter.status,
          videoId: state.context.videoId
        });
      };

      const applySettings = (settings: { readonly resumeEnabled: boolean }, startCurrentReadyState: boolean): void => {
        if (cleanedUp) {
          return;
        }

        const wasReady = settingsReady;
        settingsReady = true;
        resumeEnabled = settings.resumeEnabled;
        panel?.setResumeEnabled(resumeEnabled);

        if (!resumeEnabled) {
          contextVersion += 1;
          void stopActiveAutoResumeController();
          void stopActiveTracker();
          return;
        }

        if (startCurrentReadyState && !wasReady && latestReadyState) {
          startRuntimeForReadyState(latestReadyState);
        }
      };

      cleanupSettingsWatcher = settingsRepository.watchSettings((settings) => {
        applySettings(settings, false);
      });

      void settingsRepository.getSettings()
        .then((settings) => {
          applySettings(settings, true);
        })
        .catch((error) => {
          context.logger.warn("watchdeck settings load failed", error);
          applySettings(DEFAULT_SETTINGS, true);
        });

      const adapterOptions: YoutubeAdapterOptions = {
        diagnostics: createYoutubeDiagnostics(context),
        onBeforeContextChange: () => {
          contextVersion += 1;
          latestReadyState = undefined;
          panel?.setCurrentVideoId(null);
          void stopActiveAutoResumeController();
          void stopActiveTracker();
        }
      };
      const adapter = options.createAdapter?.(context, adapterOptions) ?? createYoutubeAdapter(adapterOptions);

      const cleanupAdapter = adapter.start(startRuntimeForReadyState);

      return () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        contextVersion += 1;
        latestReadyState = undefined;
        cleanupSettingsWatcher?.();
        panel?.setCurrentVideoId(null);
        panel?.cleanup();
        cleanupAdapter();
        void stopActiveAutoResumeController();
        void stopActiveTracker();
      };
    }
  };
}
