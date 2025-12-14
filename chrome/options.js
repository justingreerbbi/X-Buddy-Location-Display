// Options script
const LOCATION_STORAGE_KEY = "xbuddyLocationCache";
const LOOKUP_MODE_KEY = "lookupMode";
const LOOKUP_MODE_DEFAULT = "hover";
const LOOKUP_MODE_VALUES = new Set(["hover", "auto", "menu"]);
const DEBUG_KEY = "debug";
const AUTO_SCROLL_KEY = "autoScroll";
const FILTERED_LOCATIONS_KEY = "filteredLocations";
const LOCATION_TABLE_PAGE_SIZE = 20;

const locationTableState = {
	allRows: [],
	filteredRows: [],
	page: 0,
	searchTerm: "",
};

const locationTableElements = {
	body: null,
	searchInput: null,
	countLabel: null,
	pagination: null,
};

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
			// No special refresh needed for 'account' tab
		});
	});

	const debugCheckbox = document.getElementById("debug");
	const autoScrollCheckbox = document.getElementById("autoScroll");
	const autoScrollRow = document.getElementById("autoScrollRow");
	const saveButton = document.getElementById("save");
	const exportLocationsButton = document.getElementById("exportLocations");
	const importLocationsInput = document.getElementById("importLocationsCsv");
	const importLocationsButton = document.getElementById("importLocationsButton");
	const statusField = document.getElementById("status");
	const totalEntriesField = document.getElementById("totalEntries");
	const uniqueLocationsField = document.getElementById("uniqueLocations");
	const breakdownList = document.getElementById("locationBreakdown");
	const lookupModeRadios = document.querySelectorAll('input[name="lookupMode"]');
	const locationSelect = document.getElementById("locationSelect");
	const addFilterButton = document.getElementById("addFilter");
	const filteredList = document.getElementById("filteredList");
	locationTableElements.body = document.querySelector("#locationTable tbody");
	locationTableElements.searchInput = document.getElementById("locationSearch");
	locationTableElements.countLabel = document.getElementById("locationCount");
	locationTableElements.pagination = document.getElementById("locationPagination");
	initialiseLocationTableControls();

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
		chrome.storage.sync.set({ [FILTERED_LOCATIONS_KEY]: Array.from(filteredLocations) });
	};

	const setStatus = (message, isError = false) => {
		if (!statusField) return;
		statusField.textContent = message || "";
		statusField.style.color = isError ? "red" : "";
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

	const applyCacheToUi = (cache) => {
		if (!cache) return;
		populateLocationSelect(cache);
		updateStatsFromCache(cache, totalEntriesField, uniqueLocationsField, breakdownList);
		setLocationTableRows(convertCacheToRows(cache));
	};

	const refreshStats = () => {
		if (!totalEntriesField || !uniqueLocationsField || !breakdownList) return;
		readLocationCache()
			.then((cache) => {
				locationCache = cache;
				applyCacheToUi(cache);
			})
			.catch((error) => {
				console.error("X Buddy stats refresh failed", error);
			});
	};

	const updateAutoScrollVisibility = () => {
		if (!autoScrollRow) return;
		const shouldShow = Boolean(debugCheckbox?.checked);
		autoScrollRow.hidden = !shouldShow;
	};

	debugCheckbox?.addEventListener("change", updateAutoScrollVisibility);

	chrome.storage.sync.get({ [DEBUG_KEY]: false, [LOOKUP_MODE_KEY]: LOOKUP_MODE_DEFAULT, [AUTO_SCROLL_KEY]: false, [FILTERED_LOCATIONS_KEY]: [] }, (data) => {
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
		chrome.storage.local.get([LOCATION_STORAGE_KEY], (localData) => {
			locationCache = localData[LOCATION_STORAGE_KEY] || {};
			applyCacheToUi(locationCache);
		});
		displayFilteredList();
	});

	saveButton?.addEventListener("click", () => {
		if (!debugCheckbox) return;
		const selectedMode = getSelectedLookupMode();
		chrome.storage.sync.set(
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

	exportLocationsButton?.addEventListener("click", async () => {
		setStatus("Preparing location history export...");
		try {
			await exportLocationHistoryJson();
			setStatus("Location history exported successfully.");
		} catch (error) {
			console.error("X Buddy export failed", error);
			setStatus("Failed to export location history. See console for details.", true);
		}
	});

	importLocationsButton?.addEventListener("click", async () => {
		if (!importLocationsInput || !importLocationsInput.files?.length) {
			setStatus("Choose a JSON file to import.", true);
			return;
		}

		const [file] = importLocationsInput.files;
		setStatus("Importing location history from JSON...");
		try {
			await importLocationHistoryFromJson(file);
			importLocationsInput.value = "";
			setStatus("Location history imported successfully.");
			refreshStats();
		} catch (error) {
			console.error("X Buddy import failed", error);
			setStatus("Failed to import location history. See console for details.", true);
		}
	});

	refreshStats();
});

async function exportLocationHistoryJson() {
	const rawLocations = await readLocationCache();
	const normalized = {};
	for (const [username, entry] of Object.entries(rawLocations)) {
		if (entry && !entry.locations) {
			normalized[username] = {
				locations: [{ location: entry.location, timestamp: entry.timestamp }],
				current: entry.location,
			};
			continue;
		}
		normalized[username] = entry;
	}

	const exportData = {
		version: "1.0",
		exportedAt: new Date().toISOString(),
		locations: normalized,
	};

	const jsonContent = JSON.stringify(exportData, null, 2);
	const blob = new Blob([jsonContent], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	downloadLink.download = `xbuddy-location-history-${stamp}.json`;
	downloadLink.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importLocationHistoryFromJson(file) {
	const text = await file.text();
	let importData;
	try {
		importData = JSON.parse(text);
	} catch (error) {
		throw new Error("Invalid JSON file.");
	}

	if (!importData || typeof importData !== "object" || typeof importData.locations !== "object") {
		throw new Error("Invalid location history data.");
	}

	await writeLocationCache(importData.locations);
}

function readLocationCache() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(LOCATION_STORAGE_KEY, (items) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve(items?.[LOCATION_STORAGE_KEY] || {});
		});
	});
}

function writeLocationCache(cache) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.set({ [LOCATION_STORAGE_KEY]: cache }, () => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve();
		});
	});
}

function updateStatsFromCache(cache, totalEl, uniqueEl, listEl) {
	const entries = Object.entries(cache || {});
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
				const date = formatTimestamp(entry.timestamp);
				histLi.textContent = `${entry.location || "None"} (${date})`;
				historyDiv.appendChild(histLi);
			});

		li.appendChild(historyDiv);
		historyList.appendChild(li);
	});
}

function formatTimestamp(raw) {
	if (raw == null) return "";
	let date;
	if (typeof raw === "number") {
		date = new Date(raw);
	} else {
		const numeric = Number(raw);
		if (Number.isFinite(numeric)) {
			date = new Date(numeric);
		} else {
			date = new Date(raw);
		}
	}
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString();
}

function convertCacheToRows(cache) {
	if (!cache || typeof cache !== "object") return [];
	return Object.entries(cache)
		.map(([username, info]) => {
			const currentLocation = (info?.current || info?.location || "").trim();
			let timestamp = null;
			const history = Array.isArray(info?.locations) ? info.locations : [];
			if (history.length) {
				const latest = history[history.length - 1];
				timestamp = parseTimestamp(latest?.timestamp);
			}
			if (timestamp == null) {
				timestamp = parseTimestamp(info?.timestamp);
			}
			return {
				username,
				location: currentLocation,
				timestamp,
			};
		})
		.sort((a, b) => a.username.localeCompare(b.username));
}

function parseTimestamp(raw) {
	if (raw == null) return null;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	const numeric = Number(raw);
	if (Number.isFinite(numeric)) return numeric;
	const date = new Date(raw);
	if (!Number.isNaN(date.getTime())) return date.getTime();
	return null;
}

function initialiseLocationTableControls() {
	const searchEl = locationTableElements.searchInput;
	if (searchEl) {
		searchEl.addEventListener("input", (event) => {
			locationTableState.searchTerm = event.target.value || "";
			applyLocationTableSearch({ resetPage: true });
		});
	}

	setLocationTableRows([]);
}

function setLocationTableRows(rows) {
	locationTableState.allRows = Array.isArray(rows) ? rows : [];
	locationTableState.searchTerm = locationTableElements.searchInput?.value || "";
	applyLocationTableSearch({ resetPage: true });
}

function applyLocationTableSearch({ resetPage = false } = {}) {
	const term = (locationTableState.searchTerm || "").trim().toLowerCase();
	if (!term) {
		locationTableState.filteredRows = [...locationTableState.allRows];
	} else {
		locationTableState.filteredRows = locationTableState.allRows.filter((row) => {
			const username = row.username?.toLowerCase() || "";
			const location = row.location?.toLowerCase() || "";
			return username.includes(term) || location.includes(term);
		});
	}

	const totalPages = locationTableState.filteredRows.length ? Math.ceil(locationTableState.filteredRows.length / LOCATION_TABLE_PAGE_SIZE) : 0;
	if (resetPage) {
		locationTableState.page = 0;
	} else if (locationTableState.page >= totalPages && totalPages > 0) {
		locationTableState.page = totalPages - 1;
	}

	renderLocationTable();
}

function renderLocationTable() {
	const tbody = locationTableElements.body;
	if (!tbody) return;

	const rows = locationTableState.filteredRows;
	const totalRows = rows.length;
	const totalPages = totalRows ? Math.ceil(totalRows / LOCATION_TABLE_PAGE_SIZE) : 0;
	if (locationTableState.page >= totalPages && totalPages > 0) {
		locationTableState.page = totalPages - 1;
	}
	if (locationTableState.page < 0) {
		locationTableState.page = 0;
	}

	const startIndex = totalRows ? locationTableState.page * LOCATION_TABLE_PAGE_SIZE : 0;
	const visibleRows = rows.slice(startIndex, startIndex + LOCATION_TABLE_PAGE_SIZE);

	body.innerHTML = "";

	if (!visibleRows.length) {
		const emptyRow = document.createElement("tr");
		const emptyCell = document.createElement("td");
		emptyCell.colSpan = 3;
		emptyCell.textContent = totalRows === 0 ? "No entries found." : "No entries on this page.";
		emptyCell.style.color = "var(--muted)";
		emptyCell.style.textAlign = "center";
		emptyCell.style.padding = "20px 16px";
		emptyRow.appendChild(emptyCell);
		tbody.appendChild(emptyRow);
	} else {
		visibleRows.forEach((row) => {
			const tr = document.createElement("tr");
			const usernameCell = document.createElement("td");
			usernameCell.textContent = row.username || "—";
			const locationCell = document.createElement("td");
			locationCell.textContent = row.location || "—";
			const timestampCell = document.createElement("td");
			timestampCell.textContent = row.timestamp ? formatTimestamp(row.timestamp) : "—";
			tr.append(usernameCell, locationCell, timestampCell);
			tbody.appendChild(tr);
		});
	}

	if (locationTableElements.countLabel) {
		if (!totalRows) {
			locationTableElements.countLabel.textContent = "No entries found";
		} else {
			const first = startIndex + 1;
			const last = startIndex + visibleRows.length;
			locationTableElements.countLabel.textContent = `Showing ${first}–${last} of ${totalRows} entries`;
		}
	}

	updateLocationPagination(totalPages);
}

function updateLocationPagination(totalPages) {
	const container = locationTableElements.pagination;
	if (!container) return;
	container.innerHTML = "";

	if (!totalPages) {
		const info = document.createElement("span");
		info.className = "pagination-info";
		info.textContent = "Page 0 of 0";
		container.appendChild(info);
		return;
	}

	const prevButton = document.createElement("button");
	prevButton.type = "button";
	prevButton.textContent = "Previous";
	prevButton.disabled = locationTableState.page === 0;
	prevButton.addEventListener("click", () => {
		if (locationTableState.page > 0) {
			locationTableState.page -= 1;
			renderLocationTable();
		}
	});
	container.appendChild(prevButton);

	const info = document.createElement("span");
	info.className = "pagination-info";
	info.textContent = `Page ${locationTableState.page + 1} of ${totalPages}`;
	container.appendChild(info);

	const nextButton = document.createElement("button");
	nextButton.type = "button";
	nextButton.textContent = "Next";
	nextButton.disabled = locationTableState.page >= totalPages - 1;
	nextButton.addEventListener("click", () => {
		if (locationTableState.page < totalPages - 1) {
			locationTableState.page += 1;
			renderLocationTable();
		}
	});
	container.appendChild(nextButton);
}
