# Lofi Tray 🎧

A small Windows app that lives in the notification area (the hidden icons next to the clock)
and plays [Lofi Girl](https://www.youtube.com/@LofiGirl/streams) live streams in the background.

- **Left click** the icon: opens the list of live streams (thumbnail, title, listener count).
- **Middle click**: play / pause.
- **Right click**: quick menu (play/pause, switch stream, launch at startup, quit).
- Music keeps playing when the window is closed. Closing the window ≠ quitting the app.
- **Drag the top bar** to move the window: its position is remembered
  (Settings → "Replacer" puts it back next to the icon).
- Mouse wheel over the player = volume. `Space` = play/pause, `/` = search, `Esc` = close.

The interface is in French.

The list is read straight from the channel's "Live" page (no API key needed) and refreshes
on its own every 5 minutes, even with the window closed: ended streams disappear, new ones show
up. If the current stream stops and Lofi Girl restarts it under a new link, the app switches
to it automatically.

The icon uses the Lofi Girl logo (`assets/lofigirl-logo.png`, taken from lofigirl.com):
it is their trademark, keep it for personal use.

## Download

Grab the latest version from the [Releases](https://github.com/viraille/lofi-tray/releases/latest) page:

- `LofiTray-Setup-<version>.exe`: installer (adds a Start menu shortcut);
- `LofiTray-portable-<version>.exe`: portable version, no install needed.

The executables are not signed: if Windows SmartScreen shows "Windows protected your PC",
click "More info" then "Run anyway".

## Run in development mode

```bash
npm install
npm start
```

## Build the executable

```bash
npm run build
```

The version is the build date and time, formatted `day.month.year.hour` (e.g. `19.10.2026.20`),
and is shown at the bottom of the Settings panel. The installer and the portable version end up
in `dist/`.

## Project layout

| File | Role |
| --- | --- |
| `src/main.js` | Notification area icon, popup window, menu, launch at startup |
| `src/youtube.js` | Fetches and parses the list of Lofi Girl live streams |
| `src/renderer/` | Interface (HTML/CSS/JS) and embedded YouTube player |
| `scripts/build.js` | Windows build with the date-based version |
| `scripts/make-icons.ps1` | Generates the icons in `assets/` |

Settings (volume, last stream played…) are stored in `%APPDATA%\Lofi Tray\settings.json`.
