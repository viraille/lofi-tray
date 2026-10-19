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

Each platform has its own releases, named "Lofi Tray Windows …" and "Lofi Tray Android …".

**Windows** ([Windows releases](https://github.com/viraille/lofi-tray/releases?q=Windows&expanded=true)):

- `LofiTray-Setup-<version>.exe`: installer (adds a Start menu shortcut);
- `LofiTray-portable-<version>.exe`: portable version, no install needed.

The executables are not signed: if Windows SmartScreen shows "Windows protected your PC",
click "More info" then "Run anyway".

**Android 8+** ([Android releases](https://github.com/viraille/lofi-tray/releases?q=Android&expanded=true)):

- `LofiTray-android-<version>.apk`: open it on the phone and allow installing apps from this
  source when Android asks. Installing a newer APK updates the app and keeps its settings.

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

## Android version

`android/` holds an Android app (Android 8+) that reuses the same interface: the files in
`src/renderer/` and `src/youtube.js` are copied into the APK at build time, and
`android/app/src/main/web/platform.js` replaces the desktop bridge. A foreground service keeps
the music playing with the screen off, with a play/pause/stop notification, lock screen and
headset controls. A "save data" setting (on by default) keeps the video at 144p: about
85 MB/hour instead of 200 MB/hour.

It is meant to be installed by hand (APK): background playback of YouTube outside the YouTube
app is not allowed on the Play Store.

Requirements: JDK 21 (`JAVA_HOME`, or `%LOCALAPPDATA%\Programs\jdk-21`) and the Android SDK
(path in `android/local.properties`). The release APK is signed with a local key
(`android/keystore.properties` + `android/lofi-release.jks`, not in git): keep a backup of both,
updates can only be installed over the existing app with the same key.

```bash
npm run build:android
```

The APK ends up in `dist/LofiTray-android-<version>.apk`.

## Project layout

| File | Role |
| --- | --- |
| `src/main.js` | Notification area icon, popup window, menu, launch at startup |
| `src/youtube.js` | Fetches and parses the list of Lofi Girl live streams (desktop and Android) |
| `src/renderer/` | Interface (HTML/CSS/JS) and embedded YouTube player |
| `android/` | Android app: WebView kept alive in the background, playback service, YouTube relay |
| `scripts/build.js` | Windows build with the date-based version |
| `scripts/build-android.js` | Android build (signed APK copied to `dist/`) |
| `scripts/make-icons.ps1` | Generates the icons in `assets/` and the Android launcher icon |

Settings (volume, last stream played…) are stored in `%APPDATA%\Lofi Tray\settings.json`.
