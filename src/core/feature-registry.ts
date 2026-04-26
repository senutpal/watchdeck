import type { ExtensionContext } from "./extension-context";

export interface WatchdeckFeature {
  readonly id: string;
  readonly enabledByDefault: boolean;
  mount(context: ExtensionContext): void | (() => void) | Promise<void | (() => void)>;
}

export interface FeatureRegistry {
  register(feature: WatchdeckFeature): void;
  mountAll(context: ExtensionContext): Promise<void>;
  unmountAll(): Promise<void>;
  list(): readonly WatchdeckFeature[];
}

export function createFeatureRegistry(): FeatureRegistry {
  const features: WatchdeckFeature[] = [];
  const cleanups: Array<() => void> = [];

  return {
    register(feature) {
      if (features.some((registeredFeature) => registeredFeature.id === feature.id)) {
        throw new Error(`Feature already registered: ${feature.id}`);
      }

      features.push(feature);
    },

    async mountAll(context) {
      for (const feature of features) {
        if (!feature.enabledByDefault) {
          continue;
        }

        const cleanup = await feature.mount(context);

        if (typeof cleanup === "function") {
          cleanups.push(cleanup);
        }
      }
    },

    async unmountAll() {
      const pendingCleanups = cleanups.splice(0).reverse();

      for (const cleanup of pendingCleanups) {
        await Promise.resolve(cleanup());
      }
    },

    list() {
      return features.slice();
    }
  };
}
