import { createExtensionContext } from "../src/core/extension-context";
import { createFeatureRegistry, type WatchdeckFeature } from "../src/core/feature-registry";

function feature(overrides: Partial<WatchdeckFeature> = {}): WatchdeckFeature {
  return {
    id: "test-feature",
    enabledByDefault: true,
    mount: () => undefined,
    ...overrides
  };
}

describe("feature registry", () => {
  it("lists registered features in order", () => {
    const registry = createFeatureRegistry();
    const first = feature({ id: "first" });
    const second = feature({ id: "second" });

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toEqual([first, second]);
  });

  it("mounts enabled features and skips disabled features", async () => {
    const registry = createFeatureRegistry();
    const mounted: string[] = [];
    const context = createExtensionContext();

    registry.register(feature({
      id: "enabled",
      mount: () => {
        mounted.push("enabled");
      }
    }));
    registry.register(feature({
      id: "disabled",
      enabledByDefault: false,
      mount: () => {
        mounted.push("disabled");
      }
    }));

    await registry.mountAll(context);

    expect(mounted).toEqual(["enabled"]);
  });

  it("rejects duplicate feature IDs", () => {
    const registry = createFeatureRegistry();

    registry.register(feature({ id: "resume" }));

    expect(() => registry.register(feature({ id: "resume" }))).toThrow("Feature already registered: resume");
  });

  it("awaits async mount results", async () => {
    const registry = createFeatureRegistry();
    const mounted: string[] = [];

    registry.register(feature({
      id: "async",
      mount: async () => {
        mounted.push("async");
      }
    }));

    await registry.mountAll(createExtensionContext());

    expect(mounted).toEqual(["async"]);
  });

  it("unmounts cleanups in reverse order", async () => {
    const registry = createFeatureRegistry();
    const cleanupOrder: string[] = [];

    registry.register(feature({ id: "first", mount: () => () => cleanupOrder.push("first") }));
    registry.register(feature({ id: "second", mount: () => () => cleanupOrder.push("second") }));

    await registry.mountAll(createExtensionContext());
    await registry.unmountAll();

    expect(cleanupOrder).toEqual(["second", "first"]);
  });

  it("clears cleanup state after unmount", async () => {
    const registry = createFeatureRegistry();
    const cleanupOrder: string[] = [];

    registry.register(feature({ id: "cleanup", mount: () => () => cleanupOrder.push("cleanup") }));

    await registry.mountAll(createExtensionContext());
    await registry.unmountAll();
    await registry.unmountAll();

    expect(cleanupOrder).toEqual(["cleanup"]);
  });
});
