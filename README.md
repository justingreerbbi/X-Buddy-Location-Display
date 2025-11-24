# X Buddy Extension

A Chrome browser extension that displays the location of X.com users next to their usernames in the timeline.

## Features

-   Includes debug mode for console logging.

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the folder containing this extension.
5. The extension should now be installed and active.

## Usage

-   Browse the timeline on X.com (home, search, etc.).
-   The extension will automatically handle fetching the users location and will populate it.
-   Locations are cached to avoid repeated fetches.

## Options

-   Right-click the extension icon and select "Options" to access settings.
-   Enable "Debug Mode" to see console logs for troubleshooting.

There are more options planned. For now, I am just trying to get the code base stable.

## How it works

-   The content script runs on your timeline.
-   Uses background windows to fetch the information which is then passed back to the main window. It is also important to note that a new window will open to load the data and then will close.
-   The timeline updates and the results are stored for faster loading in the future.

## Notes

-   The extension assumes the location is formatted as "Account based in; [location]" on the about page.
-   If the location is not found, nothing happens.
-   Absolutely no external hooks are allowed.
-   I will try to maintain the plugin but if you want to help, send a PR! I would greatly appreciate it.

## Permissions

-   `activeTab`: Allows the extension to access the current tab for content script injection.
-   `storage`: For saving debug settings.

## ToDo's

-   Add filtering or whitelist/blacklist.
-   Add export so in the event that an update is ran, you can upload your list without building a new one.

## Compatibility

-   Chromium-based browsers, but tested on Brave.

## Credits

-   https://flagicons.lipis.dev/ - Flag assets are included.

**DISCLAIMER:**

This extension is provided "as is" without any warranties, express or implied. The author(s) is/are not responsible for any misuse of this extension or any damages that may result from its use. Users are solely responsible for ensuring their use of this extension complies with X.com's Terms of Service, applicable privacy laws, and local regulations.

This extension is intended for educational and personal use only. Do not use this extension to harvest, collect, or store personal information about other users. Respect others' privacy and use this tool responsibly.

The author disclaims all liability for any legal issues that may arise from the use of this extension.
