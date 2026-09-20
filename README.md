<p align="center"><img src="icons/icon128.png" width="96" alt="Focusling"></p>

<h1 align="center">Focusling</h1>

<p align="center">
  A Manifest V3 browser extension that pairs a Pomodoro session timer with a persistent pixel-art companion whose progression is driven entirely by verified focus time.
</p>

<p align="center">
  <a href="https://github.com/goatercoder/Focusling/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/goatercoder/Focusling/actions/workflows/test.yml/badge.svg"></a>
  <a href="https://github.com/goatercoder/Focusling/actions/workflows/package.yml"><img alt="Package" src="https://github.com/goatercoder/Focusling/actions/workflows/package.yml/badge.svg"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-blue">
  <img alt="Version" src="https://img.shields.io/badge/version-1.1.0-informational">
  <img alt="Platforms" src="https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Arc%20%7C%20Firefox-lightgrey">
</p>

---

## Overview

Focusling turns time-boxed study into a progression loop. Starting a focus block deploys your companion into a real-time canvas arena where it auto-engages waves of hostiles; every minute of completed focus is converted into experience, and experience feeds a level curve that governs the companion's damage output, fire rate, projectile count, evolution stage and unlockable roster.

The loop is deliberately asymmetric: progress is earned only through timed focus, and neglect has a cost. A companion that goes unfed for too long loses health and can be lost. Streaks, daily quests, battle reports and a memorial system round out the reinforcement design.

Everything runs locally. There is no account, no backend and no telemetry.

## Features

- **Pomodoro engine** with configurable focus, short-break and long-break durations, auto-start breaks and a four-block long-break cycle.
- **Real-time arena** rendered on `<canvas>`: weighted enemy spawns (alien, bat, UFO, eye), periodic bosses, combo tracking and a charged manual shot on click.
- **Level-driven combat stats**: damage, fire interval and bullet count are pure functions of level, and enemy scaling keeps difficulty proportional.
- **Companion lifecycle**: HP decay after a grace period, starvation, streak shields, memorial and revival with generation tracking.
- **Five-stage evolution** for the default companion, plus seven unlockable avatars.
- **Daily quests** (deterministic per calendar day), **battle reports** after each block, a **7-day focus chart** and lifetime stats.
- **Distraction shield**: an optional block-list that redirects configured domains to an interstitial page during focus blocks.
- **Toolbar badge** showing remaining minutes with colour-coded state, desktop notifications and an optional chiptune cue.
- **Mini window**: the toolbar action opens a compact always-available window docked to the top-right of the screen; a full-tab arena is one click away.
- **Keyboard**: `Space` toggles start / pause / resume, `Esc` closes dialogs.

## Installation

No build step is required; the extension loads directly from source.

### Chrome, Edge, Brave, Arc

1. Download the repository (**Code → Download ZIP**) and extract it, or clone it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder that **directly contains `manifest.json`**.
   A GitHub ZIP extracts into a nested folder (`Focusling-…/Focusling-…/manifest.json`); pick the inner one.
4. Pin Focusling from the extensions menu.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and select `manifest.json`.
   Temporary add-ons are removed on restart. For a permanent install, run `npm run package` and sign the resulting archive via [addons.mozilla.org](https://addons.mozilla.org/developers/).

A pre-built `focusling.zip` is also produced by CI on every push and attached to tagged releases.

## Usage

Click the toolbar icon. The mini window shows the arena, the timer and a **Start** button. Type what you are working on in the task line and press **Enter** or **Start**. Stats, quests, companions and settings live behind the **⚙** control.

## Mechanics

| System | Rule |
|---|---|
| Pomodoro | 25 min focus → 5 min break; 15 min long break after every 4 focus blocks. All durations adjustable. |
| Experience | 2 XP per focused minute, +10 XP per completed block, +1 XP per enemy defeated. Early stops award partial XP without block credit. |
| Level curve | `level = 1 + √(XP / 40)`. Level 2 after the first block, ~5 h for level 5, ~65 h for level 15. |
| Combat | Damage, fire interval and projectile count derive from level; enemy HP scales in step. |
| Health | Completing a block feeds the companion (up to +30 HP). After 8 idle hours HP drains linearly; starvation occurs 48 h later. Both thresholds are adjustable and decay can be disabled. |
| Evolution | Cub (Lv 1) → Bear (Lv 5) → Scholar (Lv 10) → Knight (Lv 18) → Cosmic (Lv 28). |
| Shields | Every 7-day streak grants a shield that absorbs one starvation event. |
| Streak | Consecutive calendar days with at least one focused minute. |
| Quests | Three deterministic daily quests (sessions, minutes, kills, combo, boss) with XP rewards. |
| Memorial | A starved companion is recorded in the memorial; revival starts a new generation at level 1 while preserving unlocks and lifetime stats. |

### Companions

| Companion | Unlock |
|---|---|
| Osci (default, five evolution stages) | Level 1 |
| Nyan Cat (rainbow trail) | Level 1 |
| Gloop the slime | Level 3 |
| Quackers the duck | Level 5 |
| Boo the ghost | Level 7 |
| Ribbit the frog | Level 9 |
| Bolt the robot | Level 12 |
| Ember the dragon | Level 15 |

Click the companion's name to rename it; click the avatar to switch companions and view evolution progress.

## Architecture

```
manifest.json    MV3 manifest (Chrome service worker + Firefox event page)
core.js          Game rules as pure functions: XP, levels, decay, streaks, quests, unlocks, migrations. Unit-tested.
background.js    Long-lived state owner: timer, HP decay, notifications, badge, distraction shield.
                 All mutations flow through a serialised load → mutate → persist queue.
game.js          Canvas arena: spawn weights, boss cadence, projectiles, combo tracking.
sprites.js       Pixel art for companions and enemies as 16×16 character grids with palettes.
app.js           UI layer for the mini window and full-tab arena; renders state, dispatches commands.
popup.html       Mini window        arena.html   Full-tab arena        blocked.html   Distraction interstitial
style.css        Styling
test/            node --test suites for core.js
scripts/         make-icons.py (renders the companion sprite to PNG icons), package.sh (store-ready zip)
```

Design notes:

- **Single source of truth.** All state lives under one key in `chrome.storage.local`; the background worker is the only writer.
- **Race-free mutations.** Every state change is queued through `withState()`, so concurrent messages from the popup, alarms and tabs cannot clobber each other.
- **Forward-compatible persistence.** `Core.migrate()` fills in missing fields on load, so upgrades never reset a companion.
- **Rules are testable.** `core.js` has no browser dependencies and exports via CommonJS for Node's test runner.

Adding a companion is a matter of drawing a 16×16 grid in `sprites.js` and appending one entry to `Core.AVATARS`; give it a `stages` array to enable evolution.

## Permissions and privacy

| Permission | Purpose |
|---|---|
| `storage` | Persist companion state and settings locally |
| `alarms` | Drive the timer and HP decay while the popup is closed |
| `notifications` | Announce the end of a block |
| `tabs` | Open the mini window / arena tab and apply the distraction shield |

No data leaves the browser.

## Development

```bash
npm test              # rules test-suite (node --test)
npm run icons         # regenerate icons from the companion sprite
npm run package       # build dist/focusling.zip for store submission
```

CI runs the test-suite and a syntax check on every push and publishes a loadable zip artifact.

## Roadmap

- Cosmetic upgrades purchasable with XP
- Boss-rush mode during long breaks
- Cross-device sync via `chrome.storage.sync`
- Shared rooms with friends' companions in the arena
- Weekly report card and calendar heat-map
- Per-companion audio and trail effects

See [CHANGELOG.md](CHANGELOG.md) for release history.
