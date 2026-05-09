import type { WatchdeckFeature } from "../../core/feature-registry";

export function createExampleNoopFeature(): WatchdeckFeature {
  return {
    id: "example-noop",
    enabledByDefault: false,
    mount() {
      return () => undefined;
    }
  };
}
