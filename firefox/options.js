// Options script
const LOCATION_STORAGE_KEY = "xbuddyLocationCache";
const LOOKUP_MODE_KEY = "lookupMode";
const LOOKUP_MODE_DEFAULT = "hover";
const LOOKUP_MODE_VALUES = new Set(["hover", "auto", "menu"]);
const DEBUG_KEY = "debug";
const AUTO_SCROLL_KEY = "autoScroll";
const FILTERED_LOCATIONS_KEY = "filteredLocations";

document.addEventListener("DOMContentLoaded", () => {
	// Sidebar navigation functionality
	const navLinks = document.querySelectorAll(".nav-link");
	const sectionContents = document.querySelectorAll(".section-content");

	navLinks.forEach((link) => {
		link.addEventListener("click", (e) => {
			e.preventDefault();
			const sectionName = link.getAttribute("data-section");

			// Remove active class from all links and contents
			navLinks.forEach((lnk) => lnk.classList.remove("active"));
			sectionContents.forEach((content) => content.classList.remove("active"));

			// Add active class to clicked link and corresponding content
			link.classList.add("active");
			document.getElementById(sectionName).classList.add("active");

			// Refresh content for specific tabs
			if (sectionName === "statistics") {
				refreshStats();
			} else if (sectionName === "history") {
				updateHistory().catch((error) => {
					console.error("X Buddy history refresh failed", error);
				});
			}
		});
	});

	const debugCheckbox = document.getElementById("debug");
	const autoScrollCheckbox = document.getElementById("autoScroll");
	const autoScrollRow = document.getElementById("autoScrollRow");
	const saveButton = document.getElementById("save");
	const totalEntriesField = document.getElementById("totalEntries");
	const uniqueLocationsField = document.getElementById("uniqueLocations");
	const breakdownList = document.getElementById("locationBreakdown");
	const lookupModeRadios = document.querySelectorAll('input[name="lookupMode"]');
	const locationSelect = document.getElementById("locationSelect");
	const addFilterButton = document.getElementById("addFilter");
	const filteredList = document.getElementById("filteredList");

	let filteredLocations = new Set();
	let locationCache = {};

	const displayFilteredList = () => {
		if (!filteredList) return;
		filteredList.innerHTML = "";
		if (filteredLocations.size === 0) {
			filteredList.innerHTML = "<p style='color: var(--muted); margin: 0;'>No locations filtered.</p>";
			return;
		}
		filteredLocations.forEach((location) => {
			const item = document.createElement("div");
			item.className = "filter-item";
			item.innerHTML = `
				<span>${location.replace(/\b\w/g, (l) => l.toUpperCase())}</span>
				<button data-location="${location}">Remove</button>
			`;
			item.querySelector("button").addEventListener("click", () => {
				filteredLocations.delete(location);
				displayFilteredList();
				saveFilteredLocations();
			});
			filteredList.appendChild(item);
		});
	};

	const populateLocationSelect = (cache) => {
		if (!locationSelect) return;
		locationSelect.innerHTML = '<option value="">Select a location...</option>';
		const locations = new Set();
		Object.values(cache).forEach((entry) => {
			// Handle both old and new cache formats
			const location = entry?.current || entry?.location;
			if (location) {
				locations.add(location);
			}
		});
		const sortedLocations = Array.from(locations).sort();
		sortedLocations.forEach((location) => {
			if (!filteredLocations.has(location)) {
				const option = document.createElement("option");
				option.value = location;
				option.textContent = location.replace(/\b\w/g, (l) => l.toUpperCase());
				locationSelect.appendChild(option);
			}
		});
	};

	const saveFilteredLocations = () => {
		browser.storage.sync.set({ [FILTERED_LOCATIONS_KEY]: Array.from(filteredLocations) });
	};

	const getSelectedLookupMode = () => {
		let selected = LOOKUP_MODE_DEFAULT;
		lookupModeRadios.forEach((radio) => {
			if (radio.checked) {
				selected = radio.value;
			}
		});
		return selected;
	};

	const setLookupModeRadios = (value) => {
		const normalized = LOOKUP_MODE_VALUES.has(value) ? value : LOOKUP_MODE_DEFAULT;
		lookupModeRadios.forEach((radio) => {
			radio.checked = radio.value === normalized;
		});
	};

	const refreshStats = () => {
		if (!totalEntriesField || !uniqueLocationsField || !breakdownList) return;
		updateStats(totalEntriesField, uniqueLocationsField, breakdownList).catch((error) => {
			console.error("X Buddy stats refresh failed", error);
		});
	};

	const updateAutoScrollVisibility = () => {
		if (!autoScrollRow) return;
		const shouldShow = Boolean(debugCheckbox?.checked);
		autoScrollRow.hidden = !shouldShow;
	};

	debugCheckbox?.addEventListener("change", updateAutoScrollVisibility);

	browser.storage.sync.get({ [DEBUG_KEY]: false, [LOOKUP_MODE_KEY]: LOOKUP_MODE_DEFAULT, [AUTO_SCROLL_KEY]: false, [FILTERED_LOCATIONS_KEY]: [] }, (data) => {
		if (debugCheckbox) {
			debugCheckbox.checked = Boolean(data[DEBUG_KEY]);
		}
		if (autoScrollCheckbox) {
			autoScrollCheckbox.checked = Boolean(data[AUTO_SCROLL_KEY]);
		}
		updateAutoScrollVisibility();
		setLookupModeRadios(data[LOOKUP_MODE_KEY]);
		filteredLocations = new Set(data[FILTERED_LOCATIONS_KEY] || []);
		// Get cache from local storage
		browser.storage.local.get([LOCATION_STORAGE_KEY], (localData) => {
			locationCache = localData[LOCATION_STORAGE_KEY] || {};
			populateLocationSelect(locationCache);
			refreshStats(); // Refresh stats on load
		});
		displayFilteredList();
	});

	saveButton?.addEventListener("click", () => {
		if (!debugCheckbox) return;
		const selectedMode = getSelectedLookupMode();
		browser.storage.sync.set(
			{
				[DEBUG_KEY]: debugCheckbox.checked,
				[AUTO_SCROLL_KEY]: Boolean(autoScrollCheckbox?.checked),
				[LOOKUP_MODE_KEY]: selectedMode,
			},
			() => {
				alert("Settings saved!");
			}
		);
	});

	addFilterButton?.addEventListener("click", () => {
		const selectedLocation = locationSelect?.value;
		if (!selectedLocation) return;
		filteredLocations.add(selectedLocation);
		populateLocationSelect(locationCache); // Refresh dropdown to remove the added one
		displayFilteredList();
		saveFilteredLocations();
	});

	refreshStats();
});

function readLocationCache() {
	return new Promise((resolve, reject) => {
		browser.storage.local.get(LOCATION_STORAGE_KEY, (items) => {
			if (browser.runtime.lastError) {
				reject(browser.runtime.lastError);
				return;
			}
			resolve(items?.[LOCATION_STORAGE_KEY] || {});
		});
	});
}

function writeLocationCache(cache) {
	return new Promise((resolve, reject) => {
		browser.storage.local.set({ [LOCATION_STORAGE_KEY]: cache }, () => {
			if (browser.runtime.lastError) {
				reject(browser.runtime.lastError);
				return;
			}
			resolve();
		});
	});
}

async function updateStats(totalEl, uniqueEl, listEl) {
	const cache = await readLocationCache();
	const entries = Object.entries(cache);
	totalEl.textContent = String(entries.length);

	const counts = new Map();
	entries.forEach(([, info]) => {
		const loc = (info?.current || info?.location || "").trim();
		if (!loc) return;
		counts.set(loc, (counts.get(loc) || 0) + 1);
	});

	uniqueEl.textContent = String(counts.size);
	listEl.innerHTML = "";

	const totalWithLocation = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
	if (!totalWithLocation) {
		const empty = document.createElement("li");
		empty.textContent = "No locations collected yet.";
		empty.style.color = "var(--muted)";
		listEl.appendChild(empty);
		return;
	}

	const items = Array.from(counts.entries()).sort((a, b) => {
		if (b[1] === a[1]) return a[0].localeCompare(b[0]);
		return b[1] - a[1];
	});

	items.forEach(([location, count]) => {
		const percent = formatPercentage((count / totalWithLocation) * 100);
		const li = document.createElement("li");
		const name = document.createElement("span");
		name.textContent = location;
		const value = document.createElement("span");
		value.textContent = `${percent}% · ${count}`;
		li.append(name, value);
		listEl.appendChild(li);
	});
}

function formatPercentage(value) {
	if (!Number.isFinite(value)) return "0";
	if (value >= 10) return value.toFixed(0);
	const rounded = value.toFixed(1);
	return rounded.replace(/\.0$/, "");
}

async function updateHistory() {
	const historyList = document.getElementById("history-list");
	if (!historyList) return;

	const cache = await readLocationCache();
	const entries = Object.entries(cache);
	historyList.innerHTML = "";

	if (!entries.length) {
		const empty = document.createElement("li");
		empty.textContent = "No location history available.";
		empty.style.color = "var(--muted)";
		historyList.appendChild(empty);
		return;
	}

	entries.forEach(([username, info]) => {
		// Handle both old and new formats
		const locations = info?.locations || (info?.location ? [{ location: info.location, timestamp: info.timestamp }] : []);
		const current = info?.current || info?.location || "";

		if (!locations.length) return;

		const li = document.createElement("li");
		li.style.marginBottom = "10px";

		const header = document.createElement("div");
		header.style.fontWeight = "600";
		header.textContent = `${username} (${locations.length} change${locations.length === 1 ? "" : "s"})`;
		li.appendChild(header);

		const currentDiv = document.createElement("div");
		currentDiv.style.marginLeft = "10px";
		currentDiv.style.color = "var(--accent)";
		currentDiv.textContent = `Current: ${current || "None"}`;
		li.appendChild(currentDiv);

		const historyDiv = document.createElement("ul");
		historyDiv.style.marginLeft = "20px";
		historyDiv.style.listStyle = "none";

		locations
			.slice()
			.reverse()
			.forEach((entry) => {
				const histLi = document.createElement("li");
				const date = new Date(entry.timestamp).toLocaleString();
				histLi.textContent = `${entry.location || "None"} (${date})`;
				historyDiv.appendChild(histLi);
			});

		li.appendChild(historyDiv);
		historyList.appendChild(li);
	});
}
