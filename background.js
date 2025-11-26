// Background service worker for X Buddy side panel preview

const LOCATION_STORAGE_KEY = "xbuddyLocationCache";
let previewTabId = null;
let lastLoadedUsername = null;
const pendingScrapes = new Map();
const locationListeners = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message?.type) return;

	if (message.type === "xbuddy:update-preview" && message.username) {
		handlePreviewRequest(message.username, sender?.tab)
			.then((result) => sendResponse({ ok: true, source: result?.source || "lookup" }))
			.catch((error) => {
				console.error("X Buddy preview error", error);
				sendResponse({ ok: false, error: error?.message || String(error) });
			});
		return true;
	}

	if (message.type === "xbuddy:store-location" && message.username) {
		persistLocation(message.username, message.location ?? null)
			.then(() => sendResponse({ ok: true }))
			.catch((error) => {
				console.error("X Buddy store-location failed", error);
				sendResponse({ ok: false, error: error?.message || String(error) });
			})
			.finally(() => {
				notifyLocationFound(message.username, message.location ?? null);
			});
		return true;
	}

	if (message.type === "xbuddy:get-location" && message.username) {
		getCachedLocation(message.username)
			.then((cached) => sendResponse({ ok: true, cached }))
			.catch((error) => {
				console.error("X Buddy get-location failed", error);
				sendResponse({ ok: false, error: error?.message || String(error) });
			});
		return true;
	}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (tabId !== previewTabId) return;
	if (changeInfo.status !== "complete") return;

	const username = pendingScrapes.get(tabId);
	if (!username) return;

	console.log(`X Buddy about page loaded for @${username}`);
	scrapeLocationFromAboutPage(tabId, username);
});

chrome.tabs.onRemoved.addListener((tabId) => {
	if (tabId === previewTabId) {
		pendingScrapes.delete(tabId);
		previewTabId = null;
		lastLoadedUsername = null;
	}
});

async function handlePreviewRequest(username, senderTab) {
	registerLocationListener(username, senderTab?.id ?? null);

	const cached = await getCachedLocation(username);
	if (cached?.location) {
		notifyLocationFound(username, cached.location);
		return { source: "cache" };
	}

	await ensureBackgroundTab(username, senderTab?.windowId ?? null);
	return { source: "lookup" };
}

async function ensureBackgroundTab(username, preferredWindowId) {
	const url = `https://x.com/${encodeURIComponent(username)}/about`;

	if (previewTabId) {
		if (lastLoadedUsername === username) {
			queueOrRunScrape(previewTabId, username);
			return;
		}

		const updatedTab = await chrome.tabs.update(previewTabId, {
			url,
			autoDiscardable: false,
		});
		lastLoadedUsername = username;
		queueOrRunScrape(updatedTab?.id ?? previewTabId, username);
		return;
	}

	const tabOptions = {
		url,
		active: false,
	};

	if (preferredWindowId) {
		tabOptions.windowId = preferredWindowId;
	}

	const createdTab = await chrome.tabs.create(tabOptions);
	previewTabId = createdTab.id ?? null;
	lastLoadedUsername = username;

	queueOrRunScrape(previewTabId, username);
}

async function scrapeLocationFromAboutPage(tabId, username) {
	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				const ABOUT_LABEL_TEXT = "Account based in";
				const ABOUT_LABEL_REGEX = /Account based in\s+([^\n]+)/i;

				function extractLocation() {
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
						const spans = Array.from(parent.querySelectorAll("span, div, p"))
							.map((el) => el.textContent?.trim())
							.filter(Boolean);
						const labelIndex = spans.findIndex((text) => text.includes(ABOUT_LABEL_TEXT));
						if (labelIndex >= 0 && spans[labelIndex + 1]) {
							return spans[labelIndex + 1];
						}
					}
					return null;
				}

				function waitForLocation() {
					return new Promise((resolve) => {
						const existing = extractLocation();
						if (existing) {
							resolve(existing);
							return;
						}

						const observer = new MutationObserver(() => {
							const match = extractLocation();
							if (match) {
								observer.disconnect();
								resolve(match);
							}
						});

						observer.observe(document.body, { childList: true, subtree: true });
						setTimeout(() => {
							observer.disconnect();
							resolve(null);
						}, 15000);
					});
				}

				return waitForLocation();
			},
		});

		const location = result?.result ?? null;
		console.log(`X Buddy location for @${username}: ${location ?? "(unknown)"}`);
		await persistLocation(username, location);
		notifyLocationFound(username, location ?? null);
	} catch (error) {
		console.error(`X Buddy failed to read location for @${username}`, error);
	} finally {
		pendingScrapes.delete(tabId);
		await cleanupPreviewTab();
	}
}

async function queueOrRunScrape(tabId, username) {
	if (!tabId) {
		console.warn("X Buddy missing preview tab, cannot scrape");
		return;
	}

	pendingScrapes.set(tabId, username);

	try {
		const tab = await getTab(tabId);
		if (tab?.status === "complete") {
			scrapeLocationFromAboutPage(tabId, username);
		}
	} catch (error) {
		console.warn("X Buddy could not inspect preview tab yet", error);
	}
}

function getTab(tabId) {
	return new Promise((resolve, reject) => {
		chrome.tabs.get(tabId, (tab) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve(tab);
		});
	});
}

async function persistLocation(username, location) {
	try {
		const existing = await storageGet(LOCATION_STORAGE_KEY);
		const cache = existing?.[LOCATION_STORAGE_KEY] || {};
		cache[username] = {
			location,
			timestamp: Date.now(),
		};
		await storageSet({ [LOCATION_STORAGE_KEY]: cache });
	} catch (error) {
		console.error("X Buddy failed to persist location cache", error);
	}
}

async function getCachedLocation(username) {
	try {
		const existing = await storageGet(LOCATION_STORAGE_KEY);
		const cache = existing?.[LOCATION_STORAGE_KEY] || {};
		return cache[username] || null;
	} catch (error) {
		console.error("X Buddy failed to read location cache", error);
		return null;
	}
}

function registerLocationListener(username, tabId) {
	if (!tabId || !username) return;
	let listeners = locationListeners.get(username);
	if (!listeners) {
		listeners = new Set();
		locationListeners.set(username, listeners);
	}
	listeners.add(tabId);
}

function notifyLocationFound(username, location) {
	if (!username) return;
	const listeners = locationListeners.get(username);
	if ((!listeners || listeners.size === 0) && !location) return;

	const payload = {
		type: "xbuddy:location-found",
		username,
		location,
	};

	if (listeners && listeners.size > 0) {
		listeners.forEach((tabId) => {
			chrome.tabs.sendMessage(tabId, payload, () => {
				if (chrome.runtime.lastError) {
					console.warn(`X Buddy notify failed for tab ${tabId}`, chrome.runtime.lastError);
				}
			});
		});
		locationListeners.delete(username);
	} else if (location) {
		// Allow cache-only responses even without active listeners.
		chrome.runtime.sendMessage?.(payload, () => {});
	}
}

async function cleanupPreviewTab() {
	if (!previewTabId) return;
	const tabId = previewTabId;
	previewTabId = null;
	lastLoadedUsername = null;

	try {
		await chrome.tabs.remove(tabId);
	} catch (error) {
		console.warn("X Buddy preview tab removal warning", error);
	}
}

function storageGet(keys) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(keys, (items) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve(items);
		});
	});
}

function storageSet(items) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.set(items, () => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve();
		});
	});
}
