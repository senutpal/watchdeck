const DEBUG = false;

function debugLog(...data: unknown[]): void {
  if (DEBUG) {
    console.debug(...data);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  debugLog("watchdeck installed");
});
