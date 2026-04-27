import { createExtensionContext } from "../src/core/extension-context";
import { createYoutubeDiagnostics, type YoutubeDiagnosticEventName } from "../src/adapters/youtube";

function logger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("youtube diagnostics", () => {
  it("does not call logger methods when debug is false", () => {
    const testLogger = logger();
    const diagnostics = createYoutubeDiagnostics(createExtensionContext({
      debug: false,
      logger: testLogger
    }));

    diagnostics.emit({ name: "route-detected", details: { videoId: "dQw4w9WgXcQ" } });

    expect(testLogger.debug).not.toHaveBeenCalled();
    expect(testLogger.info).not.toHaveBeenCalled();
    expect(testLogger.warn).not.toHaveBeenCalled();
    expect(testLogger.error).not.toHaveBeenCalled();
  });

  it("emits a prefixed debug entry when debug is true", () => {
    const testLogger = logger();
    const diagnostics = createYoutubeDiagnostics(createExtensionContext({
      debug: true,
      logger: testLogger
    }));

    diagnostics.emit({ name: "player-ready", details: { readyState: 1 } });

    expect(testLogger.debug).toHaveBeenCalledTimes(1);
    expect(testLogger.debug).toHaveBeenCalledWith("watchdeck:youtube", "player-ready", { readyState: 1 });
  });

  it("uses an empty details object by default", () => {
    const testLogger = logger();
    const diagnostics = createYoutubeDiagnostics(createExtensionContext({
      debug: true,
      logger: testLogger
    }));

    diagnostics.emit({ name: "cleanup" });

    expect(testLogger.debug).toHaveBeenCalledWith("watchdeck:youtube", "cleanup", {});
  });

  it("limits diagnostic event names to the adapter lifecycle events", () => {
    const names: YoutubeDiagnosticEventName[] = [
      "route-detected",
      "route-unsupported",
      "player-waiting",
      "player-ready",
      "cleanup"
    ];

    expect(names).toEqual([
      "route-detected",
      "route-unsupported",
      "player-waiting",
      "player-ready",
      "cleanup"
    ]);
  });
});
