# AI Coding Guidance for X-Buddy-Location-Display

## Big-Picture Architecture

-   Two sibling extensions live in `chrome/` (Manifest V3 + service worker) and `firefox/` (background page). They share identical content scripts, options UI, and assets; Firefox versions swap `browser.*` for `chrome.*` APIs.
-   `content.js` injects into X timelines, extracts usernames via DOM watchers, requests lookups through messages to `background.js`, and updates inline UI. Respect the constants (selectors, flag map) when modifying DOM behavior.
-   `background.js` manages a single hidden preview tab to load each profile's `/about` page, scrapes locations, caches them in `chrome.storage.local` under `xbuddyLocationCache`, and broadcasts results back to content scripts.
-   Options UI (`options.html` + `options.js` + `account.js`) is entirely vanilla JS/HTML/CSS; no frameworks or bundlers. Settings persist in `chrome.storage.sync`, while location history, auth tokens, and cache live in `chrome.storage.local`.
-   Account features talk to `https://xbuddy.local` (auth + payload upload) via fetch; the same logic is mirrored in Firefox. Keep API paths, storage keys, and masked-token handling consistent.

## Key Files & Patterns

-   `chrome/content.js` / `firefox/content.js`: long-form scripts with helper sections (constants, DOM helpers, observers, messaging). Follow the existing structure when inserting new logic—add helpers near related blocks and register listeners in `startScript`.
-   `chrome/background.js`: service worker using async helpers (`ensureBackgroundTab`, `persistLocation`). Always reuse `storageGet/storageSet` utilities and honor `LOCATION_STORAGE_KEY` when touching cache state.
-   `chrome/options.js`: central hub for the options page—handles nav tabs, statistics, filters, and import/export. Location exports normalize legacy entries (single `location` vs `locations[]`); mirror this when adding new tooling.
-   `chrome/account.js`: manages auth UI, storage (`xbuddyAuth`), login/register buttons, logout link, and the "Upload Locations" action that reuses the same normalization as export. Any new server call should piggyback on the helper `readLocationCache()` and set status text via `setStatus()`.
-   `package.py`: Python packager for building ZIPs. Run `python package.py` (or `--browser firefox`) from repo root to generate distributable archives.

## Data & Storage Contracts

-   Location cache (`xbuddyLocationCache`) structure:
    ```json
    {
      "username": {"location": "Country", "timestamp": 1700000000000, "locations": [{"location": "Country", "timestamp": ...}]}
    }
    ```
    Always normalize to `{current, locations[]}` before exporting or uploading.
-   Settings keys in `chrome.storage.sync`: `lookupMode`, `debug`, `autoScroll`, `filteredLocations`. Use the helper `initialisePreferenceSync()` as the source of truth for defaults.
-   Auth payload stored under `xbuddyAuth` with `{token, user, loggedIn, storedAt}`. Legacy compatibility code still reads `xbuddyUser`; keep it intact.

## Browser-Specific Notes

-   Chrome service worker files must stay ES modules compatible; avoid CommonJS patterns.
-   Firefox background logic expects `browser.*` namespaces and a background page defined in its manifest; when porting features ensure APIs exist (e.g., `browser.tabs.create`).

## Developer Workflow Tips

-   No build step: edit JS/HTML/CSS directly. Keep files ASCII unless assets already contain Unicode.
-   After changes, reload the unpacked extension via `chrome://extensions` (Chrome) or `about:debugging` (Firefox) to test.
-   When adding UI, stick to the existing CSS tokens in `options.html` (`--bg`, `--panel`, etc.) and the declarative nav pattern (anchors with `data-section`).
-   All network calls should set `credentials: "include"` and handle JSON parsing errors gracefully (`response.json().catch(() => ({}))`).

## External Integrations

-   X (Twitter) DOM scraping relies on specific selectors (`article[data-testid="tweet"]`, About page text). Document and gate changes carefully; regressions here break the core feature.
-   Server endpoints: auth (`/api/auth`) expects FormData email/password; payload upload (`/api/payload`) is `Content-Type: text/plain` with `Authorization: Bearer <token>`.

Keep these conventions in mind to ensure new agents can extend the extension without breaking existing behaviors. Provide feedback if any section needs clarification so we can refine this guide.
