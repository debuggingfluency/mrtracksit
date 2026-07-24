# MrTracksIt

MrTracksIt is a browser extension that tracks how much time you spend watching
video content in different languages.

## Features

- Tracks active video playback across supported streaming sites
- Supports 30+ languages with flag icons
- Lets you switch languages and pause tracking with keyboard shortcuts
- Shows daily totals, streaks, goals, calendars, and charts
- Supports manual time corrections
- Imports and exports tracking data as JSON
- Supports custom video-site trackers
- Includes light, dark, and system themes

## How to use

### Import the extension into Chrome

MrTracksIt is installed as an unpacked extension:

1. Download or copy this repository to a permanent folder on your computer.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode** in the upper-right corner.
4. Select **Load unpacked**.
5. Choose the repository's root folder—the folder containing `manifest.json`.
6. Pin **MrTracksIt** from Chrome's Extensions menu if you want quick access.

After changing the extension files, return to `chrome://extensions/` and select
the reload button on the MrTracksIt card.

### Track watch time

1. Open a video on a supported site.
2. Start playback.
3. Open MrTracksIt from the Chrome toolbar to view the dashboard and confirm the
   selected language.
4. Use `Ctrl+Shift+Y` (`Cmd+Shift+Y` on macOS) to cycle through your watched
   languages.
5. Use `Ctrl+Shift+D` (`Cmd+Shift+D` on macOS) to turn tracking on or off.

MrTracksIt counts time only while a detected video is playing. You can add a
custom tracker from Settings when a site is not detected automatically.

### Correct or move data

- Select a calendar day to set, add, subtract, or clear its watch time.
- Open Settings to export a JSON backup or import a previous backup.
- Use Settings to choose watched languages, set the appearance, and manage
  custom trackers.

## Data and privacy

MrTracksIt does not include analytics or send tracking data to an application
server. Watch history, goals, watched languages, and custom trackers use Chrome
extension storage. Some preferences, including the selected language, tracking
state, and theme, remain local to the browser; supported data may sync through
the Chrome profile when browser sync is enabled.

Imported backup files are processed inside the extension.

## Supported browsers

The root project is the Chrome/Chromium build. A separate experimental Firefox
build is available in `firefox-prototype/`.

## Project structure

- `manifest.json` — Chrome extension metadata and permissions
- `background.js` — storage and time-tracking message handling
- `popup.html`, `popup.css`, `popup.js` — dashboard interface
- `shared-content.js` — video detection and playback tracking
- `flags/` — language flag assets
- `firefox-prototype/` — experimental Firefox version

## Troubleshooting

| Problem | Suggested fix |
| --- | --- |
| Extension does not load | Select the folder that directly contains `manifest.json`. |
| Changes do not appear | Reload MrTracksIt at `chrome://extensions/`, then refresh the video page. |
| Time is not tracked | Confirm tracking is enabled and the video is actively playing. |
| Wrong language is selected | Open the dashboard or use the language-switch shortcut. |
| A site is not detected | Add it as a custom tracker in Settings. |
| You are moving browsers or profiles | Export a JSON backup first, then import it in the new installation. |
