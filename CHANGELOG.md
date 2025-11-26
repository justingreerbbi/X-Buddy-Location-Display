# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0

### Added

-   Location display feature showing "Account based in {Location}" with country flag
-   Auto-scroll functionality for continuous tweet browsing
-   Menu-click lookup mode with flag button for manual location lookups
-   Hover-based location lookup mode
-   Automatic location lookup mode
-   Options page for configuring lookup modes and auto-scroll
-   Support for multiple country flags based on location mapping
-   Automatic cache expiration for location data (30 days)
-   Content filtering to hide posts from specific countries

### Changed

-   Location display positioned between username and post content on a new line
-   Location text formatted in title case (e.g., "United States")
-   Flag icon moved to the end of the location text
-   Improved UI styling and spacing for location tags
-   Locations are now automatically displayed for accounts with cached data without requiring hover

### Fixed

-   Syntax errors and code structure issues
-   Proper escaping of location text to prevent injection
-   Flag button visibility based on lookup mode
-   Location fetching now only occurs on hover/menu actions for uncached accounts
-   Improved tab cleanup for location lookups to prevent orphaned tabs

### Technical

-   Added MutationObserver for dynamic tweet tracking
-   Implemented IntersectionObserver for visibility-based lookups
-   Added Chrome storage sync for user preferences
-   Enhanced DOM manipulation for tweet augmentation

## 1.5.1

### Changed

-   Moved the location to its own line instead od being inline with the users name.
-   Automatic cache expiration for location data (30 days)
