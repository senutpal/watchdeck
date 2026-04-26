export interface ExtensionContext {
  readonly extensionName: "watchdeck";
  readonly target: "youtube";
  readonly debug: boolean;
  readonly now: () => number;
  readonly logger: Pick<Console, "debug" | "info" | "warn" | "error">;
}

export function createExtensionContext(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    extensionName: "watchdeck",
    target: "youtube",
    debug: false,
    now: () => Date.now(),
    logger: console,
    ...overrides
  };
}
