# X Buddy Extension

A Firefox browser extension that displays the location of X.com users next to their usernames in the timeline.

## Features

-   Adds a location (if present) next to the authors name.
-   Import/Export
-   Statistics
-   No external communication. Just a standalone extension.

## Installation

1. Download or clone this repository.
2. Open Firefox and go to `about:debugging`.
3. Click "This Firefox" in the left sidebar.
4. Click "Load Temporary Add-on" and select the `manifest.json` file from this folder.
5. The extension should now be installed and active.

Note: This Firefox version uses a background page instead of service worker for better compatibility.

## Usage

-   Browse the timeline on X.com (home, search, etc.).
-   The extension will automatically handle fetching the users location and will populate it.
-   Locations are cached to avoid repeated fetches.

## Options

-   Right-click the extension icon and select "Options" to access settings.
-   Select how you want to fetch location. Theres Auto, Hover, and Button.
-   Export cached data.
-   Import and sync cached data from another machine.

There are more options planned. For now, I am just trying to get the code base stable.

## How it works

-   The content script runs on your timeline.
-   Uses background windows to fetch the information which is then passed back to the main window. It is also important to note that a new window will open to load the data and then will close.
-   The timeline updates and the results are stored for faster loading in the future.

## Development

### Packaging

To package the extension for distribution:

1. Ensure you're in the repository root directory
2. Run the packager script:

```bash
python package.py
```

This will create a ZIP file in the `chrome/` directory containing the packaged extension.

For other browsers (when supported):

```bash
python package.py --browser firefox
```

The packager automatically excludes development files and creates a clean distribution archive.

## Permissions

-   `storage`: Persists preferences, auth tokens, and cached signatures.
-   `tabs`: Allows the background page to open/manage the hidden profile preview tab.
-   `scripting`: Injects the scraping helper into the preview tab so we can read `/about` pages.

## ToDo's

-   Central DB Sync. Syncing of locations.
-   Flagging an account clearly engaged in out of country antics posing as something they are not.
-   Fix the importing and exporting and split options from locations.
-   Add data tables or something else for displaying location data in the options.

## Compatibility

-   Chromium-based browsers, but tested on Brave.

## Credits

-   https://flagicons.lipis.dev/ - Flag assets are included.

## DISCLAIMER:

This extension is provided "as is" without any warranties, express or implied. The author(s) is/are not responsible for any misuse of this extension or any damages that may result from its use. Users are solely responsible for ensuring their use of this extension complies with X.com's Terms of Service, applicable privacy laws, and local regulations.

This extension is intended for educational and personal use only. Do not use this extension to harvest, collect, or store personal information about other users. Respect others' privacy and use this tool responsibly.

The author disclaims all liability for any legal issues that may arise from the use of this extension.
