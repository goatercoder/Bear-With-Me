# Focusling 🐻 — a study pet that fights aliens while you study

Focusling is a tiny browser extension (Chrome, Edge, Brave, Firefox) that puts a pixel-art pet in your
toolbar. Start a **Pomodoro focus block** and your pet flies into the arena, blasting aliens, bats, UFOs and
the occasional mothership. Every minute you study earns XP, and XP makes your pet **stronger**: more damage,
faster shots, more bullets, new avatars.

Stop studying for too long and your pet **starves**. Keep the streak alive.

The default pet is **Osci Bear**. **Nyan Cat** (with rainbow trail) is unlocked from the start; six more pets
unlock as you level up.

<p align="center"><img src="icons/icon128.png" width="96" alt="Osci Bear"></p>

## Install (30 seconds, no build step)

**Chrome / Edge / Brave / Arc**

1. Download this repo (green *Code* button → *Download ZIP*) and unzip it, or `git clone` it.
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `Focusling` folder.
4. Pin Focusling from the puzzle-piece menu so the pet is always one click away.

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` inside the folder.
   (Temporary add-ons are removed when Firefox restarts; for a permanent install run `npm run package` and
   sign the zip through [addons.mozilla.org](https://addons.mozilla.org/developers/).)

Click the toolbar icon, hit **Start focus (25 min)** and get to work.

## How it works

| Thing | Rule |
|---|---|
| Pomodoro | 25 min focus → 5 min break, long 15 min break after every 4 focus blocks. All adjustable. Breaks can auto-start. |
| XP | **2 XP per minute** studied + **10 XP** for finishing a block + 1 XP per monster your pet defeats. |
| Level | `level = 1 + √(XP / 40)` — level 2 after your first block, level 5 around 5 hours, level 15 around 65 hours of study. |
| Power | Damage, fire rate and number of bullets all come from the level. Monsters scale too, so the arena stays fun. |
| HP | Finishing a block feeds your pet (up to +30 HP). If you don't study for **8 hours** the pet starts losing HP and starves **48 hours** later (both adjustable, or turn decay off). |
| Death | A starved pet goes to the memorial 🪦. Revive it as *Osci Bear II* at level 1. Unlocked pets and lifetime stats are kept. |
| Shields | Every 7-day streak earns a 🛡 shield that saves your pet once. |
| Streak | Consecutive days with at least one minute of focus. |
| Daily quests | Three quests a day (sessions, minutes, kills, combo, boss) for bonus XP. |
| Battle report | When a block ends you get a report: minutes, XP, monsters fought, level-ups, unlocks. |

### Pets

| Pet | Unlocks at |
|---|---|
| Osci Bear (default) | level 1 |
| Nyan Cat | level 1 |
| Gloop the slime | level 3 |
| Quackers the duck | level 5 |
| Boo the ghost | level 7 |
| Ribbit the frog | level 9 |
| Bolt the robot | level 12 |
| Ember the dragon | level 15 |

Click the pet's name to rename it. Click the avatar to switch pets.

### Other features

- **Arena tab** (⤢ button) — a big version of the arena you can keep open on a second monitor.
- **Click the arena** during focus for a charged **POW** shot (1.5 s cooldown). Kills build a combo; let a monster
  slip past and the combo resets.
- **Distraction shield** — optional. During a focus block, listed sites (YouTube, Reddit, TikTok, …) redirect to
  a page where your pet tells you to get back to work. Edit the list in ⚙ Settings.
- **Toolbar badge** shows minutes left (red = focus, green = break, amber = paused, `RIP` = uh oh).
- **Desktop notifications** and a little chiptune when a block ends. Both can be turned off.
- **Task line** — type what you're working on; press Enter to start.
- **Keyboard**: `Space` starts / pauses / resumes, `Esc` closes dialogs.
- **7-day chart** of focus minutes and lifetime stats.
- All data stays in your browser (`chrome.storage.local`). No accounts, no servers, no tracking.

## Project layout

```
manifest.json   MV3 manifest (Chrome service worker + Firefox event page)
core.js         game rules — pure functions, unit-tested
background.js   timer, HP decay, notifications, badge, distraction shield
sprites.js      pixel art (pets, monsters) as character grids
game.js         the canvas arena
app.js          popup / arena UI
popup.html      toolbar popup      arena.html   full-tab arena     blocked.html  distraction page
style.css
test/           node --test
scripts/        make-icons.py (renders Osci Bear to PNG), package.sh (zip for store upload)
```

Add a pet by drawing a 16×16 grid in `sprites.js` and adding one line to `Core.AVATARS`.

## Development

```
npm test              # rules tests
npm run icons         # regenerate icons from the Osci Bear sprite
npm run package       # dist/focusling.zip
```

## Ideas for later

- Pet accessories bought with XP (hats, scarves, laser upgrades)
- Boss rush mode on long breaks
- Sync stats between devices with `chrome.storage.sync`
- Study buddies: share a room code and see friends' pets in the arena
- Weekly report card and calendar heat-map
- Sounds/music per pet, more Nyan-style trails
