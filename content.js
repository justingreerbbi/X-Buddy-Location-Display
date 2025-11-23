// Content script for X Buddy preview popup

console.log('X Buddy: preview tracker booting');

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const trackedTweets = new Set();
const tweetVisibility = new Map();
const usernameLocations = new Map();
const pendingLocationLookups = new Set();
const pendingUsernameUpdates = new Map();
let intersectionObserver = null;
let currentUsername = null;
let pendingUsername = null;
const ABOUT_LABEL_TEXT = 'Account based in';
const ABOUT_LABEL_REGEX = /Account based in\s+([^\n]+)/i;
const COUNTRY_FLAG_MAP = new Map([
    ['united states', 'us'],
    ['united states of america', 'us'],
    ['usa', 'us'],
    ['us', 'us'],
    ['canada', 'ca'],
    ['mexico', 'mx'],
    ['brazil', 'br'],
    ['united kingdom', 'gb'],
    ['england', 'gb-eng'],
    ['scotland', 'gb-sct'],
    ['wales', 'gb-wls'],
    ['northern ireland', 'gb-nir'],
    ['ireland', 'ie'],
    ['france', 'fr'],
    ['germany', 'de'],
    ['spain', 'es'],
    ['italy', 'it'],
    ['netherlands', 'nl'],
    ['belgium', 'be'],
    ['sweden', 'se'],
    ['switzerland', 'ch'],
    ['denmark', 'dk'],
    ['finland', 'fi'],
    ['norway', 'no'],
    ['poland', 'pl'],
    ['australia', 'au'],
    ['new zealand', 'nz'],
    ['india', 'in'],
    ['pakistan', 'pk'],
    ['china', 'cn'],
    ['hong kong', 'hk'],
    ['taiwan', 'tw'],
    ['japan', 'jp'],
    ['south korea', 'kr'],
    ['north korea', 'kp'],
    ['philippines', 'ph'],
    ['thailand', 'th'],
    ['vietnam', 'vn'],
    ['singapore', 'sg'],
    ['indonesia', 'id'],
    ['malaysia', 'my'],
    ['south africa', 'za'],
    ['nigeria', 'ng'],
    ['kenya', 'ke'],
    ['egypt', 'eg'],
    ['saudi arabia', 'sa'],
    ['united arab emirates', 'ae'],
    ['uae', 'ae'],
    ['israel', 'il'],
    ['turkey', 'tr'],
    ['argentina', 'ar'],
    ['chile', 'cl'],
    ['colombia', 'co'],
    ['peru', 'pe'],
    ['uruguay', 'uy'],
    ['venezuela', 've'],
    ['russia', 'ru'],
    ['ukraine', 'ua'],
]);
let infoBadge = null;
let aboutWatcherStarted = false;

function startScript() {
    ensureInfoBadge();
    setupIntersectionObserver();
    observeTimeline();
    scanExistingTweets();
    handleAboutPage();
}
function ensureInfoBadge() {
    if (infoBadge) return infoBadge;
    const badge = document.createElement('div');
    badge.textContent = 'X Buddy preview ready';
    badge.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'right:16px',
        'padding:8px 14px',
        'background:rgba(15,20,25,0.85)',
        'color:#fff',
        'font-size:13px',
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'border-radius:999px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.45)',
        'z-index:2147483647',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.3s ease'
    ].join(';');
    document.body.appendChild(badge);
    infoBadge = badge;
    return badge;
}

function flashInfoBadge(message) {
    const badge = ensureInfoBadge();
    badge.textContent = message;
    badge.style.opacity = '1';
    setTimeout(() => {
        badge.style.opacity = '0';
    }, 2000);
}

function setupIntersectionObserver() {
    if (intersectionObserver) return;
    intersectionObserver = new IntersectionObserver(handleVisibility, {
        root: null,
        threshold: [0, 0.25, 0.5, 0.75, 1],
    });
}

function handleVisibility(entries) {
    entries.forEach((entry) => {
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        tweetVisibility.set(entry.target, ratio);
    });
    updateActiveTweet();
}

function updateActiveTweet() {
    let bestTweet = null;
    let bestRatio = 0;

    tweetVisibility.forEach((ratio, tweet) => {
        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestTweet = tweet;
        }
    });

    if (!bestTweet || bestRatio === 0) return;
    const username = extractUsername(bestTweet);
    if (!username) return;

    scheduleLookupForUsername(username);
}

function scheduleLookupForUsername(username) {
    if (username === pendingUsername) return;

    if (usernameLocations.has(username)) {
        const knownLocation = usernameLocations.get(username);
        currentUsername = username;
        pendingUsername = null;
        flashInfoBadge(`@${username}: ${knownLocation}`);
        updateLocationDisplays(username, knownLocation);
        return;
    }

    const existingTimer = pendingUsernameUpdates.get(username);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        pendingUsernameUpdates.delete(username);
        initiateLocationLookup(username);
    }, 250);

    pendingUsernameUpdates.set(username, timer);
}

function initiateLocationLookup(username) {
    if (!username || username === pendingUsername) return;
    pendingUsername = username;
    requestPreviewWindow(username);
}

function requestPreviewWindow(username) {
    chrome.runtime.sendMessage({ type: 'xbuddy:update-preview', username }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn('X Buddy preview message failed', chrome.runtime.lastError);
            return;
        }
        if (!response?.ok) return;

        if (response?.source === 'cache') {
            return;
        }

        if (currentUsername !== username) {
            currentUsername = username;
            notifyLocationLookupStarted(username);
        }
    });
}

function notifyLocationLookupStarted(username) {
    console.log(`X Buddy: locating profile @${username}`);
    flashInfoBadge(`Finding @${username}...`);
}

function trackTweet(tweet) {
    if (trackedTweets.has(tweet)) return;
    trackedTweets.add(tweet);
    tweetVisibility.set(tweet, 0);
    intersectionObserver.observe(tweet);
    applyLocationToTweet(tweet);
}

function untrackTweet(tweet) {
    if (!trackedTweets.has(tweet)) return;
    trackedTweets.delete(tweet);
    tweetVisibility.delete(tweet);
    intersectionObserver.unobserve(tweet);
}

function collectTweets(node) {
    const tweets = [];
    if (node.nodeType !== Node.ELEMENT_NODE) return tweets;
    if (node.matches?.(TWEET_SELECTOR)) tweets.push(node);
    node.querySelectorAll?.(TWEET_SELECTOR).forEach((tweet) => tweets.push(tweet));
    return tweets;
}

function observeTimeline() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => collectTweets(node).forEach(trackTweet));
            mutation.removedNodes.forEach((node) => collectTweets(node).forEach(untrackTweet));
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function scanExistingTweets() {
    document.querySelectorAll(TWEET_SELECTOR).forEach(trackTweet);
}

function extractUsername(tweetElement) {
    const anchor = tweetElement.querySelector('[data-testid="User-Name"] a[href^="/"]');
    if (!anchor) return null;
    const href = anchor.getAttribute('href') || '';
    const match = href.match(/^\/([^\/\?]+)/);
    return match ? match[1] : null;
}

function ready(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
        fn();
    }
}

function handleAboutPage() {
    if (!isAboutPage() || aboutWatcherStarted) return;
    const username = extractUsernameFromPath(location.pathname, location.search);
    if (!username) return;
    aboutWatcherStarted = true;
    console.log(`X Buddy: about page detected for @${username}`);
    watchForAboutLocation(username);
}

function isAboutPage() {
    const normalizedPath = location.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
    return /^\/[^\/]+\/about$/i.test(normalizedPath);
}

function extractUsernameFromPath(pathname, search = '') {
    const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
    const match = normalized.match(/^\/([^\/]+)\/about$/i);
    if (!match) return null;
    return decodeURIComponent(match[1]);
}

function watchForAboutLocation(username) {
    const stopIfFound = () => tryCaptureAboutLocation(username);
    if (stopIfFound()) return;

    const observer = new MutationObserver(() => {
        if (stopIfFound()) {
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => observer.disconnect(), 20000);
}

function tryCaptureAboutLocation(username) {
    const location = extractAboutLocation();
    if (!location) return false;

    console.log(`X Buddy: location for @${username}: ${location}`);
    flashInfoBadge(`@${username}: ${location}`);
    usernameLocations.set(username, location);
    updateLocationDisplays(username, location);

    const pendingTimer = pendingUsernameUpdates.get(username);
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingUsernameUpdates.delete(username);
    }

    chrome.runtime.sendMessage({ type: 'xbuddy:store-location', username, location });
    return true;
}

function extractAboutLocation() {
    const locationNode = document.querySelector('[data-testid="UserLocation"]');
    const direct = locationNode?.textContent?.trim();
    if (direct) return direct;

    const bodyText = document.body?.innerText || '';
    const labelMatch = bodyText.match(ABOUT_LABEL_REGEX);
    if (labelMatch && labelMatch[1]) {
        const candidate = labelMatch[1].trim();
        if (candidate) return candidate;
    }

    const labelElement = findElementContainingText(ABOUT_LABEL_TEXT);
    if (labelElement) {
        const inline = extractSiblingLocation(labelElement);
        if (inline) return inline;
    }

    return null;
}

function findElementContainingText(targetText) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            if (!node.textContent) return NodeFilter.FILTER_SKIP;
            return node.textContent.includes(targetText) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
    });

    return walker.nextNode();
}

function extractSiblingLocation(labelElement) {
    const inline = labelElement.textContent.replace(ABOUT_LABEL_TEXT, '').trim();
    if (inline) return inline;

    const siblingText = labelElement.nextElementSibling?.textContent?.trim();
    if (siblingText) return siblingText;

    const parent = labelElement.parentElement;
    if (parent) {
        const spans = [...parent.querySelectorAll('span, div, p')].map((el) => el.textContent?.trim()).filter(Boolean);
        const labelIndex = spans.findIndex((text) => text.includes(ABOUT_LABEL_TEXT));
        if (labelIndex >= 0 && spans[labelIndex + 1]) {
            return spans[labelIndex + 1];
        }
    }

    return null;
}

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'xbuddy:location-found' || !message.username) {
        return;
    }

    const locationText = message.location || 'Location unavailable';
    console.log(`X Buddy: resolved @${message.username} location -> ${locationText}`);
    flashInfoBadge(`@${message.username}: ${locationText}`);
    if (message.location) {
        usernameLocations.set(message.username, message.location);
        updateLocationDisplays(message.username, message.location);
    }

    const pendingTimer = pendingUsernameUpdates.get(message.username);
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingUsernameUpdates.delete(message.username);
    }

    if (currentUsername === message.username) {
        pendingUsername = null;
        currentUsername = null;
    }
});

function applyLocationToTweet(tweet) {
    const username = extractUsername(tweet);
    if (!username) return;

    const location = usernameLocations.get(username);
    if (location) {
        renderLocationTag(tweet, location);
    } else {
        ensureLocationForUsername(username);
    }
}

function updateLocationDisplays(username, location) {
    trackedTweets.forEach((tweet) => {
        const tweetUser = extractUsername(tweet);
        if (tweetUser === username) {
            renderLocationTag(tweet, location);
        }
    });
}

function renderLocationTag(tweet, location) {
    if (!location) return;
    const nameContainer = tweet.querySelector('[data-testid="User-Name"]');
    if (!nameContainer) return;

    const primaryNameRow = nameContainer.querySelector('div:first-child');
    const insertionTarget = primaryNameRow || nameContainer;

    let tag = insertionTarget.querySelector('.xbuddy-location-tag');
    if (!tag) {
        tag = document.createElement('span');
        tag.className = 'xbuddy-location-tag';
        tag.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:4px',
            'margin-left:6px',
            'font-size:12px',
            'color:rgb(113,118,123)',
            'font-weight:500',
            'white-space:nowrap',
        ].join(';');
        insertionTarget.appendChild(tag);
    }

    const { labelText, flagSrc } = resolveLocationDisplay(location);

    tag.textContent = '';

    if (flagSrc) {
        let flagImg = tag.querySelector('img');
        if (!flagImg) {
            flagImg = document.createElement('img');
            flagImg.alt = '';
            flagImg.style.cssText = [
                'width:14px',
                'height:14px',
                'border-radius:2px',
                'object-fit:cover',
            ].join(';');
            tag.appendChild(flagImg);
        }
        flagImg.src = flagSrc;
    }

    const textNode = document.createElement('span');
    textNode.textContent = `| ${labelText}`;
    tag.appendChild(textNode);
}

function resolveLocationDisplay(location) {
    const normalized = location.trim().toLowerCase();
    const code = COUNTRY_FLAG_MAP.get(normalized);
    if (!code) {
        return { labelText: location, flagSrc: null };
    }
    const flagUrl = chrome.runtime.getURL(`assets/flags/${code}.svg`);
    return { labelText: location, flagSrc: flagUrl };
}

function ensureLocationForUsername(username) {
    if (!username || pendingLocationLookups.has(username) || usernameLocations.has(username)) return;
    pendingLocationLookups.add(username);
    chrome.runtime.sendMessage({ type: 'xbuddy:get-location', username }, (response) => {
        pendingLocationLookups.delete(username);
        if (chrome.runtime.lastError) {
            console.warn('X Buddy cache lookup failed', chrome.runtime.lastError);
            return;
        }
        if (!response?.ok) return;
        const location = response.location || null;
        if (location) {
            usernameLocations.set(username, location);
            updateLocationDisplays(username, location);
        }
    });
}

ready(startScript);
