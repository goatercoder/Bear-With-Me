# Don't let Oski die! 🐻🩸

A tiny 8-bit **Oski** (the Cal bear) lives in the **top-right corner** of your browser. That's it. That's the
extension.

- **Work** in the browser and Oski is fine. If he was hurt, he slowly heals (about 90 minutes to full health).
- **Open** YouTube, Reddit, Instagram or clashroyaleapi.com and he loses **8% on the spot** in a burst
  of blood, and the **Stanford Tree** walks in and beats him for as long as you stay. Blood pours from his eyes
  first, then his ear tears and his mouth bleeds, then an eye goes and bone shows through a paw, then his skull
  is exposed and an arm is gone. **20 minutes** on those sites kills a healthy Oski.
- **Go idle** (no keyboard or mouse for a minute) and he fades too, more slowly: about 2 hours to die.
- **Switch to another app** (browser not focused) and nothing happens either way.
- When he dies he lies there grey with a fly on him. Click him (or the toolbar icon) to bring him back. He keeps
  count of how many times you've killed him.

No timers, no stats, no XP. Just keep him alive.

<p align="center"><img src="icons/icon128.png" width="96" alt="Oski"></p>

## Install (30 seconds, no build step)

**Chrome / Edge / Brave / Arc**

1. Download this repo (green *Code* button → *Download ZIP*) and unzip it, or `git clone` it.
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder that **directly contains `manifest.json`**.
   ⚠ A GitHub ZIP unpacks into a folder *inside* a folder of the same name. Pick the inner one, otherwise
   Chrome says "Manifest file is missing or unreadable".
4. Pin Oski from the puzzle-piece menu.

**Firefox**: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `manifest.json`.

Click the toolbar icon once. A little window with Oski appears in the top-right corner of your screen and he
starts watching what you do. Oski also shows up in the top-right corner of every web page (so he bleeds right
there on YouTube). Hover him to see his health and what's hurting him.

**Move him out of the way:** drag Oski. On a web page he goes anywhere you drop him, and the spot is
remembered for every tab and every site. In his own little window, dragging him moves that window around your
screen. A plain click (no dragging) still revives him when he's dead.

**Keep him on top of everything:** hover Oski in his window and click **📌**. He moves into a floating
picture-in-picture window that stays above every other window and tab, even the new-tab page or another app.
His small window minimises itself (it has to stay open for the floating one to exist). Click ↩ or close the
floating window to go back. Drag that floating window by the bar along its top edge. Needs Chrome 116+.

## The gear

Hover Oski in his window and a small ⚙ appears. Behind it:

- the list of sites that hurt him, one per line. Out of the box: **clashroyaleapi.com, reddit.com,
  youtube.com, instagram.com**. Subdomains count, so `m.reddit.com` and `old.reddit.com` are covered,
- whether to show him on web pages at all, and **…only when I'm on a taboo site** — tick that and he stays out
  of sight everywhere else, appearing the moment you open one of the sites above. His own little window always
  shows him either way,
- desktop notifications at 50%, 20% and death,
- turn him off / reset.

The toolbar badge shows his health once he's hurt, `RIP` when he's dead, `off` when he's switched off.

## Notes

- Chrome only adds content scripts to pages loaded after an extension is installed or reloaded, so Oski
  injects himself into every open tab when installed. If he's missing from a page, reload it.
- The corner window is a normal browser window and can end up behind others; use 📌 to float him on top.
- Tracking uses the browser's idle detector and the active tab of the focused browser window. Nothing leaves
  your computer; state lives in `chrome.storage.local`.
- All the injuries are pixel-art patches in `oski.js` (`STAGES`). Rates are in `rules.js` (`RATES`).

## Project layout

```
manifest.json   MV3 manifest (Chrome service worker + Firefox event page)
rules.js        health rules — pure functions, unit-tested
background.js   watches tabs / focus / idle, charges time, notifications, badge, opens the window
oski.js         the sprite, the injury stages, and the animated renderer
window.html/js  the tiny corner window
overlay.js      content script: Oski in the corner of every page
test/           npm test
scripts/        make-icons.py (renders Oski to PNG), package.sh (zip for store upload)
```

## Development

```
npm test              # rules + sprite tests
npm run icons         # regenerate icons from the Oski sprite
npm run package       # dist/focusling.zip
```
