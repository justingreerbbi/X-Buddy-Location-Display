// Content script for X Buddy preview popup

// X Buddy: preview tracker booting

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const LOOKUP_MODE_KEY = "lookupMode";
const LOOKUP_MODES = {
	AUTO: "auto",
	HOVER: "hover",
	MENU: "menu",
};
const DEBUG_KEY = "debug";
const AUTO_SCROLL_KEY = "autoScroll";
const FILTERED_LOCATIONS_KEY = "filteredLocations";
const AUTO_SCROLL_POST_DELAY_MS = 5000;
const AUTO_SCROLL_BATCH_SIZE = 10;
const AUTO_SCROLL_REST_MS = 2 * 60 * 1000;
const FLAG_BUTTON_CLASS = "xbuddy-flag-button";
const MENU_BUTTON_SELECTOR = 'button[data-testid="caret"]';
const FLAG_BUTTON_COLOR = "rgb(113, 118, 123)";
const FLAG_BUTTON_HOVER_COLOR = "#1d9bf0";
const trackedTweets = new Set();
const tweetVisibility = new Map();
const usernameLocations = new Map();
const pendingLocationLookups = new Set();
const pendingUsernameUpdates = new Map();
let intersectionObserver = null;
let currentUsername = null;
let pendingUsername = null;
let lookupMode = LOOKUP_MODES.HOVER;
let debugModeEnabled = false;
let autoScrollPreference = false;
let autoScrollController = null;
let autoScrollLastTweet = null;
let filteredLocations = new Set();
const ABOUT_LABEL_TEXT = "Account based in";
const ABOUT_LABEL_REGEX = /Account based in\s+([^\n]+)/i;
const COUNTRY_FLAG_MAP = new Map([
	["united states", "us"],
	["united states of america", "us"],
	["usa", "us"],
	["us", "us"],
	["canada", "ca"],
	["mexico", "mx"],
	["brazil", "br"],
	["united kingdom", "gb"],
	["england", "gb-eng"],
	["scotland", "gb-sct"],
	["wales", "gb-wls"],
	["northern ireland", "gb-nir"],
	["ireland", "ie"],
	["france", "fr"],
	["germany", "de"],
	["spain", "es"],
	["italy", "it"],
	["netherlands", "nl"],
	["belgium", "be"],
	["sweden", "se"],
	["switzerland", "ch"],
	["denmark", "dk"],
	["finland", "fi"],
	["norway", "no"],
	["poland", "pl"],
	["australia", "au"],
	["new zealand", "nz"],
	["india", "in"],
	["pakistan", "pk"],
	["china", "cn"],
	["hong kong", "hk"],
	["taiwan", "tw"],
	["japan", "jp"],
	["south korea", "kr"],
	["north korea", "kp"],
	["philippines", "ph"],
	["thailand", "th"],
	["vietnam", "vn"],
	["singapore", "sg"],
	["indonesia", "id"],
	["malaysia", "my"],
	["south africa", "za"],
	["nigeria", "ng"],
	["kenya", "ke"],
	["egypt", "eg"],
	["saudi arabia", "sa"],
	["united arab emirates", "ae"],
	["uae", "ae"],
	["israel", "il"],
	["turkey", "tr"],
	["argentina", "ar"],
	["chile", "cl"],
	["colombia", "co"],
	["peru", "pe"],
	["uruguay", "uy"],
	["venezuela", "ve"],
	["russia", "ru"],
	["ukraine", "ua"],
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
	const badge = document.createElement("div");
	badge.textContent = "X Buddy preview ready";
	badge.style.cssText = [
		"position:fixed",
		"bottom:16px",
		"right:16px",
		"padding:8px 14px",
		"background:rgba(15,20,25,0.85)",
		"color:#fff",
		"font-size:13px",
		'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
		"border-radius:999px",
		"box-shadow:0 8px 32px rgba(0,0,0,0.45)",
		"z-index:2147483647",
		"pointer-events:none",
		"opacity:0",
		"transition:opacity 0.3s ease",
	].join(";");
	document.body.appendChild(badge);
	infoBadge = badge;
	return badge;
}

function flashInfoBadge(message) {
	const badge = ensureInfoBadge();
	badge.textContent = message;
	badge.style.opacity = "1";
	setTimeout(() => {
		badge.style.opacity = "0";
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

	// Removed auto fetching on visibility
}

function scheduleLookupForUsername(username, reason = "auto") {
	if (!username) return;

	if (usernameLocations.has(username)) {
		const knownLocation = usernameLocations.get(username);
		currentUsername = username;
		pendingUsername = null;
		updateLocationDisplays(username, knownLocation);
		return;
	}

	if (reason === "hover" || reason === "menu") {
		if (username === pendingUsername) return;
		initiateLocationLookup(username);
		return;
	}

	// Removed auto mode fetching
}

function handleTweetHover(event) {
	if (lookupMode !== LOOKUP_MODES.HOVER) return;
	const tweet = event?.currentTarget;
	if (!tweet) return;
	const username = extractUsername(tweet);
	if (!username) return;
	scheduleLookupForUsername(username, "hover");
}

function initiateLocationLookup(username) {
	if (!username || username === pendingUsername) return;
	pendingUsername = username;
	requestPreviewWindow(username);
}

function requestPreviewWindow(username) {
	chrome.runtime.sendMessage({ type: "xbuddy:update-preview", username }, (response) => {
		if (chrome.runtime.lastError) {
			console.warn("X Buddy preview message failed", chrome.runtime.lastError);
			return;
		}
		if (!response?.ok) return;

		if (response?.source === "cache") {
			return;
		}

		if (currentUsername !== username) {
			currentUsername = username;
			notifyLocationLookupStarted(username);
		}
	});
}

function notifyLocationLookupStarted(username) {
	// Locating profile
}

function trackTweet(tweet) {
	if (trackedTweets.has(tweet)) return;
	trackedTweets.add(tweet);
	tweetVisibility.set(tweet, 0);
	intersectionObserver.observe(tweet);
	tweet.addEventListener("mouseenter", handleTweetHover);
	ensureTweetActionsAugmented(tweet);
	applyLocationToTweet(tweet);
}

function untrackTweet(tweet) {
	if (!trackedTweets.has(tweet)) return;
	trackedTweets.delete(tweet);
	tweetVisibility.delete(tweet);
	intersectionObserver.unobserve(tweet);
	tweet.removeEventListener("mouseenter", handleTweetHover);
	removeFlagButton(tweet);
}

function collectTweets(node) {
	const tweets = [];
	if (node.nodeType !== Node.ELEMENT_NODE) return tweets;
	if (node.matches?.(TWEET_SELECTOR)) tweets.push(node);
	node.querySelectorAll?.(TWEET_SELECTOR).forEach((tweet) => tweets.push(tweet));
	return tweets;
}

function ensureTweetActionsAugmented(tweet) {
	if (lookupMode === LOOKUP_MODES.MENU) {
		ensureMenuFlagButton(tweet);
	} else {
		removeFlagButton(tweet);
	}
}

function updateFlagButtonsVisibility() {
	trackedTweets.forEach((tweet) => ensureTweetActionsAugmented(tweet));
}

function ensureMenuFlagButton(tweet) {
	if (!tweet) return;
	const existing = tweet.querySelector(`.${FLAG_BUTTON_CLASS}`);
	if (existing) {
		existing.hidden = false;
		return;
	}

	const menuButton = tweet.querySelector(MENU_BUTTON_SELECTOR);
	if (!menuButton || !menuButton.parentElement) return;
	const flagButton = createFlagButton(menuButton);
	const container = menuButton.parentElement;
	container.insertBefore(flagButton, container.firstChild);
}

function createFlagButton(referenceButton) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `${referenceButton?.className || ""} ${FLAG_BUTTON_CLASS}`.trim();
	button.setAttribute("aria-label", "Lookup location");
	button.dataset.xbuddyFlagButton = "true";
	button.addEventListener("click", handleFlagButtonClick, { passive: false });

	const innerWrapper = document.createElement("div");
	innerWrapper.dir = "ltr";
	innerWrapper.style.cssText = `color:${FLAG_BUTTON_COLOR};display:flex;align-items:center;justify-content:center;padding:0 5px;transition:color 0.2s ease`;
	innerWrapper.className = referenceButton?.firstElementChild?.className || "";

	const iconWrapper = document.createElement("div");
	iconWrapper.style.cssText = "display:flex;align-items:center;justify-content:center";
	iconWrapper.className = referenceButton?.firstElementChild?.firstElementChild?.className || "";

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("aria-hidden", "true");
	svg.style.width = "20px";
	svg.style.height = "20px";
	svg.style.fill = "currentColor";

	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "M5 4a1 1 0 00-1 1v15l2-3h10l1 4 3-1V5a1 1 0 00-1-1H5zm10 2v8.382l-.276-.553A1 1 0 0013.828 14H7V6h8z");
	svg.appendChild(path);
	iconWrapper.appendChild(svg);
	innerWrapper.appendChild(iconWrapper);
	button.appendChild(innerWrapper);
	button.addEventListener("mouseenter", () => {
		innerWrapper.style.color = FLAG_BUTTON_HOVER_COLOR;
	});
	button.addEventListener("mouseleave", () => {
		innerWrapper.style.color = FLAG_BUTTON_COLOR;
	});
	return button;
}

function removeFlagButton(tweet) {
	if (!tweet) return;
	const button = tweet.querySelector(`.${FLAG_BUTTON_CLASS}`);
	if (!button) return;
	button.removeEventListener("click", handleFlagButtonClick);
	button.remove();
}

function handleFlagButtonClick(event) {
	event.preventDefault();
	event.stopPropagation();
	const button = event.currentTarget;
	const tweet = button?.closest(TWEET_SELECTOR);
	const username = tweet ? extractUsername(tweet) : null;
	if (!username) {
		flashInfoBadge("No username detected");
		return;
	}
	scheduleLookupForUsername(username, "menu");
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
	const href = anchor.getAttribute("href") || "";
	const match = href.match(/^\/([^\/\?]+)/);
	return match ? match[1] : null;
}

function ready(fn) {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", fn, { once: true });
	} else {
		fn();
	}
}

function handleAboutPage() {
	if (!isAboutPage() || aboutWatcherStarted) return;
	const username = extractUsernameFromPath(location.pathname, location.search);
	if (!username) return;
	aboutWatcherStarted = true;
	// About page detected
	watchForAboutLocation(username);
}

function isAboutPage() {
	const normalizedPath = location.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
	return /^\/[^\/]+\/about$/i.test(normalizedPath);
}

function extractUsernameFromPath(pathname, search = "") {
	const normalized = pathname.replace(/\/+/g, "/").replace(/\/$/, "");
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

	// Location found
	usernameLocations.set(username, location);
	updateLocationDisplays(username, location);

	const pendingTimer = pendingUsernameUpdates.get(username);
	if (pendingTimer) {
		clearTimeout(pendingTimer);
		pendingUsernameUpdates.delete(username);
	}

	chrome.runtime.sendMessage({ type: "xbuddy:store-location", username, location }, () => {
		if (chrome.runtime.lastError) {
			// Suppress unchecked error
		}
	});
	return true;
}

function extractAboutLocation() {
	const locationNode = document.querySelector('[data-testid="UserLocation"]');
	const direct = locationNode?.textContent?.trim();
	if (direct) return direct;

	const bodyText = document.body?.innerText || "";
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
	const inline = labelElement.textContent.replace(ABOUT_LABEL_TEXT, "").trim();
	if (inline) return inline;

	const siblingText = labelElement.nextElementSibling?.textContent?.trim();
	if (siblingText) return siblingText;

	const parent = labelElement.parentElement;
	if (parent) {
		const spans = [...parent.querySelectorAll("span, div, p")].map((el) => el.textContent?.trim()).filter(Boolean);
		const labelIndex = spans.findIndex((text) => text.includes(ABOUT_LABEL_TEXT));
		if (labelIndex >= 0 && spans[labelIndex + 1]) {
			return spans[labelIndex + 1];
		}
	}

	return null;
}

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type !== "xbuddy:location-found" || !message.username) {
		return;
	}

	const locationText = message.location || "Location unavailable";
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
		// Hide tweet if location is filtered
		if (filteredLocations.has(location)) {
			tweet.style.display = "none";
		} else {
			tweet.style.display = "";
		}
	} else {
		// Load from cache if available, don't fetch
		ensureLocationForUsername(username, false);
	}
}

function updateLocationDisplays(username, location) {
	trackedTweets.forEach((tweet) => {
		const tweetUser = extractUsername(tweet);
		if (tweetUser === username) {
			renderLocationTag(tweet, location);
			// Hide tweet if location is filtered
			if (filteredLocations.has(location)) {
				tweet.style.display = "none";
			} else {
				tweet.style.display = "";
			}
		}
	});
}

function renderLocationTag(tweet, location) {
	if (!location) return;
	// Find the tweet text container (post content)
	const postContent = tweet.querySelector('[data-testid="tweetText"]');
	if (!postContent) return;

	// Remove any existing tag
	let tag = tweet.querySelector(".xbuddy-location-tag");
	if (tag) tag.remove();

	// Create a new block element for the location
	tag = document.createElement("div");
	tag.className = "xbuddy-location-tag";
	tag.style.cssText = ["display:flex", "align-items:center", "gap:6px", "margin: 2px 0 4px 0", "font-size:14px", "color:rgb(113,118,123)", "font-weight:500", "white-space:nowrap"].join(";");

	const { labelText, flagSrc } = resolveLocationDisplay(location);

	const textNode = document.createElement("span");
	textNode.textContent = "Account based in " + labelText.replace(/\b\w/g, (l) => l.toUpperCase());
	tag.appendChild(textNode);

	if (flagSrc) {
		const flagImg = document.createElement("img");
		flagImg.alt = "";
		flagImg.style.cssText = ["width:16px", "height:16px", "border-radius:2px", "object-fit:cover"].join(";");
		flagImg.src = flagSrc;
		tag.appendChild(flagImg);
	}

	// Insert the location tag just above the post content
	postContent.parentNode.insertBefore(tag, postContent);
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

function ensureLocationForUsername(username, allowFetch = true) {
	if (!username || pendingLocationLookups.has(username)) return;
	pendingLocationLookups.add(username);
	chrome.runtime.sendMessage({ type: "xbuddy:get-location", username }, (response) => {
		pendingLocationLookups.delete(username);
		if (chrome.runtime.lastError) {
			console.warn("X Buddy cache lookup failed", chrome.runtime.lastError);
			return;
		}
		if (!response?.ok) return;
		const cached = response.cached;
		const now = Date.now();
		const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
		if (cached && cached.location && cached.timestamp && now - cached.timestamp < thirtyDaysMs) {
			// Use cached location
			usernameLocations.set(username, cached.location);
			updateLocationDisplays(username, cached.location);
		} else if (allowFetch) {
			// Fetch new location
			requestPreviewWindow(username);
		}
	});
}

initialisePreferenceSync();
ready(startScript);

function initialisePreferenceSync() {
	chrome.storage.sync.get(
		{
			[LOOKUP_MODE_KEY]: LOOKUP_MODES.HOVER,
			[DEBUG_KEY]: false,
			[AUTO_SCROLL_KEY]: false,
			[FILTERED_LOCATIONS_KEY]: [],
		},
		(data) => {
			if (chrome.runtime.lastError) {
				console.warn("X Buddy preference read failed", chrome.runtime.lastError);
				return;
			}
			applyLookupModePreference(data[LOOKUP_MODE_KEY]);
			applyAutomationPreferences(Boolean(data[DEBUG_KEY]), Boolean(data[AUTO_SCROLL_KEY]));
			filteredLocations = new Set(data[FILTERED_LOCATIONS_KEY] || []);
		}
	);

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "sync") return;

		if (Object.prototype.hasOwnProperty.call(changes, LOOKUP_MODE_KEY)) {
			applyLookupModePreference(changes[LOOKUP_MODE_KEY]?.newValue);
		}

		if (Object.prototype.hasOwnProperty.call(changes, DEBUG_KEY) || Object.prototype.hasOwnProperty.call(changes, AUTO_SCROLL_KEY)) {
			const debugValue = Object.prototype.hasOwnProperty.call(changes, DEBUG_KEY) ? Boolean(changes[DEBUG_KEY]?.newValue) : debugModeEnabled;
			const autoScrollValue = Object.prototype.hasOwnProperty.call(changes, AUTO_SCROLL_KEY) ? Boolean(changes[AUTO_SCROLL_KEY]?.newValue) : autoScrollPreference;
			applyAutomationPreferences(debugValue, autoScrollValue);
		}

		if (Object.prototype.hasOwnProperty.call(changes, FILTERED_LOCATIONS_KEY)) {
			filteredLocations = new Set(changes[FILTERED_LOCATIONS_KEY]?.newValue || []);
			// Re-apply filtering to existing tweets
			trackedTweets.forEach((tweet) => applyLocationToTweet(tweet));
		}
	});
}

function applyLookupModePreference(mode) {
	const validModes = new Set(Object.values(LOOKUP_MODES));
	const normalized = validModes.has(mode) ? mode : LOOKUP_MODES.HOVER;
	if (lookupMode === normalized) return;
	if (normalized !== LOOKUP_MODES.AUTO) {
		pendingUsernameUpdates.forEach((timer) => clearTimeout(timer));
		pendingUsernameUpdates.clear();
	}
	lookupMode = normalized;
	updateFlagButtonsVisibility();
}

function applyAutomationPreferences(debugValue, autoScrollValue) {
	const normalizedDebug = Boolean(debugValue);
	const normalizedAuto = Boolean(autoScrollValue);
	const previouslyActive = debugModeEnabled && autoScrollPreference;
	debugModeEnabled = normalizedDebug;
	autoScrollPreference = normalizedAuto;
	const shouldRun = debugModeEnabled && autoScrollPreference;

	if (shouldRun && !previouslyActive) {
		startAutoScroll();
	} else if (!shouldRun && previouslyActive) {
		stopAutoScroll();
	}
}

function startAutoScroll() {
	if (autoScrollController) return;
	autoScrollController = { stopped: false, timers: new Set() };
	autoScrollLastTweet = null;
	autoScrollLoop(autoScrollController).catch((error) => {
		console.warn("X Buddy auto-scroll loop stopped", error);
	});
}

function stopAutoScroll() {
	if (!autoScrollController) return;
	autoScrollController.stopped = true;
	autoScrollController.timers.forEach((timer) => {
		clearTimeout(timer.id);
		timer.resolve();
	});
	autoScrollController.timers.clear();
	autoScrollController = null;
	autoScrollLastTweet = null;
}

async function autoScrollLoop(controller) {
	while (controller && !controller.stopped) {
		let traversed = 0;
		while (traversed < AUTO_SCROLL_BATCH_SIZE && controller && !controller.stopped) {
			const tweet = getNextScrollableTweet();
			if (tweet) {
				scrollTweetIntoView(tweet);
				traversed += 1;
			}
			await sleep(controller, AUTO_SCROLL_POST_DELAY_MS);
		}

		if (!controller || controller.stopped) break;
		await sleep(controller, AUTO_SCROLL_REST_MS);
	}
}

function getNextScrollableTweet() {
	const tweets = Array.from(document.querySelectorAll(TWEET_SELECTOR));
	if (!tweets.length) return null;

	if (!autoScrollLastTweet) {
		const visible = tweets.find(isElementMostlyVisible);
		autoScrollLastTweet = visible || tweets[0];
		return autoScrollLastTweet;
	}

	const currentIndex = tweets.indexOf(autoScrollLastTweet);
	if (currentIndex === -1) {
		autoScrollLastTweet = tweets[0];
		return autoScrollLastTweet;
	}

	if (currentIndex + 1 < tweets.length) {
		autoScrollLastTweet = tweets[currentIndex + 1];
		return autoScrollLastTweet;
	}

	window.scrollBy({ top: window.innerHeight * 0.75, behavior: "smooth" });
	return null;
}

function scrollTweetIntoView(tweet) {
	if (!tweet) return;
	tweet.scrollIntoView({ behavior: "smooth", block: "center" });
}

function isElementMostlyVisible(element) {
	if (!element) return false;
	const rect = element.getBoundingClientRect();
	if (!rect || rect.height === 0) return false;
	const viewHeight = window.innerHeight || document.documentElement.clientHeight || 0;
	const visibleTop = Math.max(rect.top, 0);
	const visibleBottom = Math.min(rect.bottom, viewHeight);
	const visibleHeight = Math.max(visibleBottom - visibleTop, 0);
	return visibleHeight >= rect.height * 0.25;
}

function sleep(controller, duration) {
	return new Promise((resolve) => {
		if (!controller || controller.stopped) {
			resolve();
			return;
		}
		const timer = {
			id: null,
			resolve,
		};
		timer.id = setTimeout(() => {
			controller.timers.delete(timer);
			resolve();
		}, duration);
		controller.timers.add(timer);
	});
}
