# Privacy Statement

**Last reviewed:** 2026-05-09

WatchDeck is a local-first browser extension. This page is the full statement of what data WatchDeck touches, where it lives, and what it never does.

## What WatchDeck stores

For every YouTube video you watch on a `/watch` page, WatchDeck saves a small record in your own browser's local storage:

- The canonical YouTube video ID.
- The last playback timestamp in seconds.
- The video duration in seconds.
- The local time of the last update.
- A flag indicating whether the video is considered complete.
- A schema version number.

That is the complete list. No titles. No thumbnails. No transcripts. No channel data. No watch history. No identifiers other than the YouTube video ID itself.

## Where it stores it

All records live in `chrome.storage.local`. This storage area is:

- Bound to your browser profile on this device.
- Not synced to a Google account.
- Not visible to other extensions.
- Not visible to any web page, including youtube.com.

WatchDeck does not use `chrome.storage.sync`, `IndexedDB`, cookies, or any cloud storage.

## What WatchDeck never does

- WatchDeck does not have a server. There is no backend.
- WatchDeck does not make network requests.
- WatchDeck does not include analytics, telemetry, error reporting, A/B test frameworks, or feature flags fetched from a remote service.
- WatchDeck does not read or store the title or thumbnail of any video.
- WatchDeck does not read or store anything about pages outside `youtube.com/watch`.
- WatchDeck does not include third-party scripts, SDKs, or trackers of any kind.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `storage` | Save the resume records described above. |
| `activeTab` | When you click the toolbar icon, identify the URL of the current YouTube tab so the popup can target it for "Clear progress for this video". This permission is granted only on a user gesture. It is revoked when you switch tabs. |
| Content script match on `https://www.youtube.com/*` | The only place the resume logic runs. WatchDeck does not request or use a content script match anywhere else. |

WatchDeck does not request `tabs`, `scripting`, `cookies`, `webRequest`, `<all_urls>`, or any host permission outside YouTube.

## How to inspect what is stored

- Open the WatchDeck popup. The "Now watching" card shows the active video. The "Clear all" link erases every saved record.
- For raw inspection, open `chrome://extensions`, find WatchDeck, click "Service worker" or "Inspect views", then run `chrome.storage.local.get(null)` in the DevTools console.

## How to delete everything

- Open the popup. Click **Clear all**. Confirm. All resume records are erased.
- Or open `chrome://extensions` and remove the WatchDeck extension. Chrome wipes its `chrome.storage.local` automatically on uninstall.

## Children's privacy

WatchDeck does not collect personal data of any kind. It is not directed at children. It is also not specifically restricted from them.

## Changes to this statement

If WatchDeck ever stores additional fields, requests new permissions, or contacts a network endpoint, this document will be updated and the change will be called out in the [CHANGELOG](CHANGELOG.md). No silent expansions of scope.

## Contact

Questions or concerns about this statement can be raised on the project repository, or by email at <contactutpalsen@gmail.com>. For security disclosures see [SECURITY.md](SECURITY.md).
