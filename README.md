# Oski — don't let him die 🐻🩸

A tiny 8-bit **Oski** (the Cal bear) lives in the **top-right corner** of your browser. That's it. That's the
extension.

- **Work** in the browser and Oski is fine. If he was hurt, he slowly heals (about 90 minutes to full health).
- **Open** YouTube, Instagram, Reddit, Twitter/X or a Clash Royale site and he loses **8% on the spot** in a burst
  of blood, and the **Stanford Tree** walks in and beats him for as long as you stay. Blood pours from his eyes
  first, then his ear tears and his mouth bleeds, then an eye goes and bone shows through a paw, then his skull
  is exposed and an arm is gone. **20 minutes** on those sites kills a healthy Oski.
- **Go idle** (no keyboard or mouse for a minute) and he fades too, more slowly: about 2 hours to die.
- **Switch to another app** (browser not focused) and nothing happens either way.
- When he dies he lies there grey with a fly on him. Click him (or the toolbar icon) to bring him back. He keeps
  count of how many times you've killed him.

No timers, no stats, no XP. Just keep him alive.

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

**Keep him on top of everything:** hover Oski in his window and click **📌**. He moves into a floating
picture-in-picture window that stays above every other window and tab, even the new-tab page or another app.
His small window minimises itself (it has to stay open for the floating one to exist). Click ↩ or close the
floating window to go back. Needs Chrome 116+.

## The gear

| Activity | Detection | Effect |
|---|---|---|
| **Working** | Focused browser window, active tab not on the block-list | Heals: 90 minutes from zero to full |
| **Distracted** | Active tab matches a block-listed domain | Hurts: 30 minutes from full health to death |
| **Idle** | No keyboard or mouse input for 60 seconds | Hurts slowly: 2 hours to death |
| **Away** | Browser not the focused application | Neutral |

Damage is rendered as five cumulative injury stages drawn directly onto the sprite (bruised → bleeding → broken → dying → dead), so the cost of a doomscrolling session is visible on the page where it is happening. A dead Oski is revived with a click; the extension keeps count.

Everything runs locally. No accounts, no servers, no telemetry.

## Features

- Chrome only adds content scripts to pages loaded after an extension is installed or reloaded, so Oski
  injects himself into every open tab when installed. If he's missing from a page, reload it.
- The corner window is a normal browser window and can end up behind others; use 📌 to float him on top.
- Tracking uses the browser's idle detector and the active tab of the focused browser window. Nothing leaves
  your computer; state lives in `chrome.storage.local`.
- All the injuries are pixel-art patches in `oski.js` (`STAGES`). Rates are in `rules.js` (`RATES`).

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
