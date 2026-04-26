export interface WatchdeckSettings {
  readonly resumeEnabled: boolean;
  readonly debugLogging: boolean;
}

export const DEFAULT_SETTINGS: WatchdeckSettings = {
  resumeEnabled: true,
  debugLogging: false
};
