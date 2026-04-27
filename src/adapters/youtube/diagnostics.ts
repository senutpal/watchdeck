import type { ExtensionContext } from "../../core/extension-context";

export type YoutubeDiagnosticEventName = "route-detected" | "route-unsupported" | "player-waiting" | "player-ready" | "cleanup";

export interface YoutubeDiagnosticEvent {
  readonly name: YoutubeDiagnosticEventName;
  readonly details?: Record<string, unknown>;
}

export interface YoutubeDiagnostics {
  readonly emit: (event: YoutubeDiagnosticEvent) => void;
}

export function createYoutubeDiagnostics(context: ExtensionContext): YoutubeDiagnostics {
  return {
    emit(event) {
      if (!context.debug) {
        return;
      }

      context.logger.debug("watchdeck:youtube", event.name, event.details ?? {});
    }
  };
}
