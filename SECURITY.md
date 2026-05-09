# Security Policy

WatchDeck is a browser extension. The most likely security issue is one that lets a malicious page read or alter local resume data, or that escalates the extension's narrow permissions into something broader. We take both seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Instead, contact the maintainer privately:

- Open a private security advisory through GitHub's "Security" tab on the repo.
- Or email <contactutpalsen@gmail.com> with `[WatchDeck security]` in the subject.

Include:

- A clear description of the issue.
- The browser and version where you observed it.
- Steps to reproduce or a proof of concept.
- The impact you believe this has.

You will get an acknowledgment within 72 hours.

## What is in scope

- Vulnerabilities that allow a third-party page to read, modify, or exfiltrate stored resume data.
- Vulnerabilities that escalate the extension's permissions beyond what the manifest declares.
- Code that calls out to a network endpoint not declared in the privacy statement.
- Cross-site scripting through any DOM the extension injects.
- Violations of the principle that WatchDeck only runs on `youtube.com/watch`.

## What is out of scope

- Issues that require physical access to the user's unlocked machine.
- Theoretical attacks that depend on the user installing a separate malicious extension.
- Reports about YouTube DOM changes breaking selectors. Those are bugs, not security issues. Please open a normal bug report.
- Reports against unsupported browser versions.

## Disclosure timeline

We aim for the following:

- Acknowledgment within 72 hours.
- A written assessment within 7 days.
- A fix or mitigation within 30 days for confirmed issues.
- Coordinated public disclosure once a fix is shipped.

## Supported versions

Only the latest published version receives security fixes.

## Bounty

WatchDeck does not run a paid bounty program. We are happy to credit reporters in the [CHANGELOG](CHANGELOG.md) and the release notes.
