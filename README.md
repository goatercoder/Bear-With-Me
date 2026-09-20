<p align="center"><img src="icons/icon128.png" width="96" alt="Oski"></p>

<h1 align="center">Oski</h1>

<p align="center">
  A Manifest V3 browser extension that keeps an 8-bit companion in the corner of your browser and ties its health directly to how you spend your time: distracting sites and idleness hurt it, real work heals it.
</p>

<p align="center">
  <a href="https://github.com/goatercoder/Focusling/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/goatercoder/Focusling/actions/workflows/test.yml/badge.svg"></a>
  <a href="https://github.com/goatercoder/Focusling/actions/workflows/package.yml"><img alt="Package" src="https://github.com/goatercoder/Focusling/actions/workflows/package.yml/badge.svg"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-blue">
  <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-informational">
  <img alt="Platforms" src="https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Arc%20%7C%20Firefox-lightgrey">
</p>

---

## Overview

Oski is a deliberately minimal accountability mechanic. There are no timers, points, streaks or dashboards. A single pixel-art bear lives in a small always-on-top window and, optionally, in the top-right corner of every page you visit. The extension continuously classifies what you are doing in the browser and charges time against the bear's health at a rate that depends on that classification:

| Activity | Detection | Effect |
|---|---|---|
| **Working** | Focused browser window, active tab not on the block-list | Heals: 90 minutes from zero to full |
| **Distracted** | Active tab matches a block-listed domain | Hurts: 30 minutes from full health to death |
| **Idle** | No keyboard or mouse input for 60 seconds | Hurts slowly: 2 hours to death |
| **Away** | Browser not the focused application | Neutral |

Damage is rendered as five cumulative injury stages drawn directly onto the sprite (bruised → bleeding → broken → dying → dead), so the cost of a doomscrolling session is visible on the page where it is happening. A dead Oski is revived with a click; the extension keeps count.

Everything runs locally. No accounts, no servers, no telemetry.

## Features

- **Continuous activity classification** from window focus, active-tab URL and the browser's idle detector, re-evaluated on every tab, window and idle event plus a 30-second alarm.
- **Rate-based health model**: elapsed time is settled at the previous activity's rate whenever activity changes, so switching tabs never loses or double-counts time.
- **Cumulative injury rendering**: a 24×24 base sprite with patch overlays per stage, shared by the window, the on-page overlay and the icon generator.
- **Corner window** opened from the toolbar action and parked in the top-right of the screen; hover for health and cause.
- **Page overlay** injected as a content script inside a closed shadow root, so host-page styles cannot affect it and it cannot affect them.
- **Configurable block-list** (defaults: YouTube, Instagram, Reddit, Twitter/X, TikTok and Clash Royale sites) with subdomain matching and host normalisation.
- **Notifications** at 50 %, 20 % and death, each naming the site responsible; toolbar badge shows remaining health, `RIP`, or `off`.
- **Kill switch and reset** behind a gear control in the window.

## Installation

No build step is required; the extension loads directly from source.

### Chrome, Edge, Brave, Arc

1. Download the repository (**Code → Download ZIP**) and extract it, or clone it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder that **directly contains `manifest.json`**.
   A GitHub ZIP extracts into a nested folder of the same name; pick the inner one.
4. Pin Oski from the extensions menu and click it once to start.

### Firefox

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and select `manifest.json`. Temporary add-ons are removed on restart; for a permanent install run `npm run package` and sign the archive via [addons.mozilla.org](https://addons.mozilla.org/developers/).

A store-ready `focusling.zip` is produced by CI on every push and attached to tagged releases.

## Usage

Click the toolbar icon. A small window with Oski appears in the top-right corner of the screen and monitoring begins. Hover Oski to see his health and what is affecting it. Hover to reveal the **⚙** control, which opens:

- the list of sites that hurt him, one per line
- whether to also show him on every web page
- desktop notifications on or off
- turn off / reset

If he dies, click him in the window, on any page, or click the toolbar icon to revive him.

## Architecture

```
manifest.json    MV3 manifest: service worker (Chrome) / event page (Firefox), content script, permissions
rules.js         Health model as pure functions: rates, default state, host matching, settle / setActivity / revive. Unit-tested.
background.js    Long-lived state owner: activity classification, alarm-driven settling, notifications, badge, window management
oski.js          24×24 sprite, injury-stage patches, stage selection and animated canvas renderer
window.html/js   The corner window and its settings panel
overlay.js       Content script: Oski in a closed shadow root at the top-right of every page
test/            node --test suites for rules.js and the sprite stages
scripts/         make-icons.py (renders the sprite to PNG icons), package.sh (store-ready zip)
```

Design notes:

- **Single writer.** All state lives under one key in `chrome.storage.local`; only the background worker mutates it, through a serialised load → mutate → persist queue, so concurrent messages from the window, overlay, alarms and tab events cannot race.
- **Settle-before-switch.** `setActivity()` charges the elapsed interval at the old rate before recording the new activity, keeping the health integral exact regardless of event timing.
- **Pure rules.** `rules.js` has no browser dependencies and is exported via CommonJS for Node's test runner; rates and the default block-list are the only tunables.
- **Sprite as data.** Injuries are `[row, col, chars]` patches applied cumulatively per stage; tests assert that the grids stay well-formed and that blood never decreases as health falls.

## Permissions and privacy

| Permission | Purpose |
|---|---|
| `storage` | Persist state and settings locally |
| `alarms` | Settle health every 30 s while no page is open |
| `tabs`, `host_permissions` | Read the active tab's hostname for classification; inject the overlay |
| `idle` | Detect keyboard / mouse inactivity |
| `notifications` | Warn at 50 %, 20 % and death |

Only the hostname of the active tab is inspected, in memory, and nothing leaves the browser.

## Development

```bash
npm test              # rules and sprite test-suite (node --test)
npm run icons         # regenerate icons from the sprite
npm run package       # build dist/focusling.zip
```

CI runs the test-suite and a syntax check on every push and publishes a loadable zip artifact.

## History

Version 1.x was a Pomodoro timer with an XP-driven arena game; 2.0 replaced it with the single-companion model described above. See [CHANGELOG.md](CHANGELOG.md).
