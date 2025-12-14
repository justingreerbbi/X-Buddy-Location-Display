// Account tab logic for X Buddy Firefox extension

const AUTH_STORAGE_KEY = "xbuddyAuth";
const SIGNATURE_VERSION_KEY = "xbuddySignatureVersion";
const LOCATION_CACHE_KEY = "xbuddyLocationCache";
const API_BASE = "https://xbuddy.local";
const AUTH_ENDPOINT = `${API_BASE}/api/auth`;
const PAYLOAD_ENDPOINT = `${API_BASE}/api/payload`;
const MANIFEST_ENDPOINT = `${API_BASE}/api/signatures/manifest`;
const REGISTER_URL = `${API_BASE}/register`;

document.addEventListener("DOMContentLoaded", () => {
	const statusEl = document.getElementById("accountStatus");
	const loginForm = document.getElementById("loginForm");
	const emailInput = document.getElementById("emailInput");
	const passwordInput = document.getElementById("passwordInput");
	const loginSubmit = document.getElementById("loginSubmit");
	const registerBtn = document.getElementById("registerBtn");
	const loginActions = document.getElementById("loginActions");
	const sessionCard = document.getElementById("sessionCard");
	const userMeta = document.getElementById("userMeta");
	const userName = document.getElementById("userName");
	const tokenValue = document.getElementById("tokenValue");
	const signatureVersionValue = document.getElementById("signatureVersionValue");
	const logoutBtn = document.getElementById("logoutBtn");
	const syncLocationsBtn = document.getElementById("syncLocationsBtn");
	const uploadLocationsBtn = document.getElementById("uploadLocationsBtn");

	let syncInProgress = false;
	let autoSyncTriggered = false;

	const setStatus = (message, type = "") => {
		if (!statusEl) return;
		statusEl.textContent = message;
		statusEl.className = `account-status${type ? ` ${type}` : ""}`;
	};

	const setButtonLoading = (button, isLoading, busyLabel = "Working…") => {
		if (!button) return;
		if (!button.dataset.label) {
			button.dataset.label = button.textContent?.trim() || "Action";
		}
		button.disabled = isLoading;
		button.textContent = isLoading ? busyLabel : button.dataset.label;
	};

	const resolveApiUrl = (path) => {
		if (!path) return path;
		try {
			return new URL(path, API_BASE).toString();
		} catch (error) {
			console.warn("X Buddy failed to resolve API url", path, error);
			return path;
		}
	};

	const readAuthState = () =>
		new Promise((resolve) => {
			browser.storage.local.get([AUTH_STORAGE_KEY, "xbuddyUser"], (data) => {
				if (browser.runtime.lastError) {
					console.warn("X Buddy auth read failed", browser.runtime.lastError);
					resolve(null);
					return;
				}
				if (data?.[AUTH_STORAGE_KEY]) {
					resolve(data[AUTH_STORAGE_KEY]);
					return;
				}
				if (data?.xbuddyUser) {
					const legacy = data.xbuddyUser;
					resolve({
						token: legacy.token,
						user: legacy.user || { name: legacy.username, email: legacy.email },
						loggedIn: legacy.loggedIn,
						storedAt: Date.now(),
					});
					return;
				}
				resolve(null);
			});
		});

	const writeAuthState = (value) =>
		new Promise((resolve) => {
			browser.storage.local.set({ [AUTH_STORAGE_KEY]: value }, () => {
				if (browser.runtime.lastError) {
					console.error("X Buddy auth write failed", browser.runtime.lastError);
				}
				resolve();
			});
		});

	const clearAuthState = () =>
		new Promise((resolve) => {
			browser.storage.local.remove(AUTH_STORAGE_KEY, () => {
				if (browser.runtime.lastError) {
					console.error("X Buddy auth clear failed", browser.runtime.lastError);
				}
				resolve();
			});
		});

	const maskToken = (token) => {
		if (!token || token.length < 12) return token || "";
		return `${token.slice(0, 8)}...${token.slice(-6)}`;
	};

	function readLocationCache() {
		return new Promise((resolve, reject) => {
			browser.storage.local.get(LOCATION_CACHE_KEY, (items) => {
				if (browser.runtime.lastError) {
					reject(browser.runtime.lastError);
					return;
				}
				resolve(items?.[LOCATION_CACHE_KEY] || {});
			});
		});
	}

	function writeLocationCache(cache) {
		return new Promise((resolve, reject) => {
			browser.storage.local.set({ [LOCATION_CACHE_KEY]: cache }, () => {
				if (browser.runtime.lastError) {
					reject(browser.runtime.lastError);
					return;
				}
				resolve();
			});
		});
	}

	const readSignatureVersionState = () =>
		new Promise((resolve) => {
			browser.storage.local.get(SIGNATURE_VERSION_KEY, (data) => {
				if (browser.runtime.lastError) {
					console.warn("X Buddy signature version read failed", browser.runtime.lastError);
					resolve({ version: 0, lastSyncedAt: null });
					return;
				}
				const state = data?.[SIGNATURE_VERSION_KEY];
				resolve({
					version: Number(state?.version) || 0,
					lastSyncedAt: state?.lastSyncedAt || null,
				});
			});
		});

	const writeSignatureVersionState = (state) =>
		new Promise((resolve) => {
			browser.storage.local.set({ [SIGNATURE_VERSION_KEY]: state }, () => {
				if (browser.runtime.lastError) {
					console.error("X Buddy signature version write failed", browser.runtime.lastError);
				}
				resolve();
			});
		});

	const updateSignatureBadge = async () => {
		const state = await readSignatureVersionState();
		if (signatureVersionValue) {
			signatureVersionValue.textContent = String(state.version || 0);
		}
	};

	const handleUnauthorized = async () => {
		await clearAuthState();
		autoSyncTriggered = false;
		setStatus("Session expired. Please log in again.", "error");
		await updateUi();
	};

	const readResponseText = async (response, { description, expectCompressed }) => {
		const hasDecompressionStream = typeof DecompressionStream === "function";
		const encodingHeader = response.headers.get("content-encoding") || "";
		const contentType = response.headers.get("content-type") || "";
		const shouldAttemptManualGzip = Boolean(
			expectCompressed && hasDecompressionStream && response.body && (!encodingHeader.includes("gzip") || contentType.includes("application/gzip") || contentType.includes("application/octet-stream"))
		);
		if (shouldAttemptManualGzip) {
			try {
				const decompressedStream = response.clone().body.pipeThrough(new DecompressionStream("gzip"));
				return await new Response(decompressedStream).text();
			} catch (error) {
				console.warn(`X Buddy ${description} gzip decode failed`, error);
			}
		}
		return await response.text();
	};

	const fetchJsonWithAuth = async (url, token, { method = "GET", body = undefined, headers = {}, description = "request", expectCompressed = false } = {}) => {
		console.log("X Buddy request start", { description, method, url });
		const response = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
				...headers,
			},
			body,
			credentials: "include",
		});

		const responseText = await readResponseText(response, { description, expectCompressed });
		let parsed = null;
		try {
			parsed = responseText ? JSON.parse(responseText) : null;
		} catch (error) {
			console.warn(`X Buddy ${description} response was not JSON`, error);
		}

		console.log("X Buddy request complete", {
			description,
			status: response.status,
			ok: response.ok,
		});

		if (response.status === 401) {
			await handleUnauthorized();
			throw new Error("Unauthorized");
		}

		if (!response.ok) {
			throw new Error(parsed?.error || parsed?.message || responseText || `${description} failed with status ${response.status}`);
		}

		return parsed ?? {};
	};

	const normaliseSnapshotEntry = (entry, version, timestamp, existing = null, { resetHistory = false } = {}) => {
		const username = typeof entry?.u === "string" ? entry.u.trim() : "";
		const location = typeof entry?.l === "string" ? entry.l.trim() : "";
		if (!username) return null;
		const record = resetHistory || !existing ? { locations: [] } : { ...existing };
		const history = Array.isArray(record.locations) ? [...record.locations] : [];
		if (resetHistory) {
			history.length = 0;
		}
		if (location) {
			const last = history[history.length - 1];
			if (!last || last.location !== location) {
				history.push({ location, timestamp, version });
			}
		}
		return {
			username,
			record: {
				current: location,
				lastVersion: version,
				versionAdded: record.versionAdded || entry?.va || version,
				locations: history,
			},
		};
	};

	const applyBaseSnapshot = async (baseData, expectedVersion) => {
		if (!baseData || !Array.isArray(baseData.data)) {
			throw new Error("Invalid base snapshot payload.");
		}
		const snapshotVersion = Number(baseData.version) || expectedVersion;
		const timestamp = Date.now();
		const cache = {};
		baseData.data.forEach((entry) => {
			const normalised = normaliseSnapshotEntry(entry, snapshotVersion, timestamp, null, { resetHistory: true });
			if (normalised) {
				cache[normalised.username] = normalised.record;
			}
		});
		await writeLocationCache(cache);
		return cache;
	};

	const applyDeltaSnapshot = async (deltaData, cache) => {
		if (!deltaData) {
			throw new Error("Invalid delta snapshot payload.");
		}
		const workingCache = cache || (await readLocationCache());
		const timestamp = Date.now();
		const added = Array.isArray(deltaData.added) ? deltaData.added : [];
		added.forEach((entry) => {
			const usernameForLookup = typeof entry?.u === "string" ? entry.u.trim() : "";
			const normalised = normaliseSnapshotEntry(entry, deltaData.toVersion, timestamp, workingCache[usernameForLookup]);
			if (normalised) {
				workingCache[normalised.username] = normalised.record;
			}
		});
		const removed = Array.isArray(deltaData.removed) ? deltaData.removed : [];
		removed.forEach((entry) => {
			const username = typeof entry?.u === "string" ? entry.u.trim() : "";
			if (username) {
				delete workingCache[username];
			}
		});
		await writeLocationCache(workingCache);
		return workingCache;
	};

	const updateUi = async () => {
		const auth = await readAuthState();
		if ((auth?.token && auth?.user) || auth?.loggedIn) {
			setStatus(`Signed in as ${auth.user?.name || auth.user?.email || auth.user || ""}`, "success");
			if (loginForm) loginForm.style.display = "none";
			if (loginActions) loginActions.style.display = "none";
			if (registerBtn) registerBtn.style.display = "none";
			if (sessionCard && userMeta && tokenValue) {
				sessionCard.hidden = false;
				userName.textContent = `${auth.user?.name || "User"} · ${auth.user?.email || ""}`.trim();
				tokenValue.textContent = maskToken(auth.token || auth?.tokenValue || "");
				updateSignatureBadge();
			}
			if (!autoSyncTriggered) {
				autoSyncTriggered = true;
				runSignatureSync({ silent: true }).catch((error) => {
					console.warn("X Buddy auto sync failed", error);
				});
			}
		} else {
			setStatus("Not logged in.");
			if (loginForm) loginForm.style.display = "";
			if (loginActions) loginActions.style.display = "";
			if (registerBtn) registerBtn.style.display = "";
			if (sessionCard) {
				sessionCard.hidden = true;
			}
			autoSyncTriggered = false;
			if (signatureVersionValue) {
				signatureVersionValue.textContent = "0";
			}
		}
	};

	const setLoginLoading = (isLoading) => {
		const baseLabel = loginSubmit?.dataset.label || loginSubmit?.textContent || "Log In";
		if (loginSubmit && !loginSubmit.dataset.label) {
			loginSubmit.dataset.label = baseLabel;
		}
		if (loginSubmit) loginSubmit.disabled = isLoading;
		if (emailInput) emailInput.disabled = isLoading;
		if (passwordInput) passwordInput.disabled = isLoading;
		if (loginSubmit) loginSubmit.textContent = isLoading ? "Working..." : loginSubmit.dataset.label;
	};

	const uploadLocationCache = async ({ silent = false, authOverride = null } = {}) => {
		const auth = authOverride || (await readAuthState());
		if (!auth?.token) {
			if (!silent) setStatus("Not logged in.", "error");
			return false;
		}

		if (!silent) {
			setStatus("Uploading locations...");
			setButtonLoading(uploadLocationsBtn, true, "Uploading…");
		}

		try {
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

			const payload = {
				version: "1.0",
				exportedAt: new Date().toISOString(),
				locations: normalized,
			};
			const locationCount = Object.keys(normalized).length;

			console.log("X Buddy upload request", {
				endpoint: PAYLOAD_ENDPOINT,
				payloadPreview: {
					version: payload.version,
					exportedAt: payload.exportedAt,
					locationCount,
				},
				authTokenMasked: maskToken(auth.token),
			});

			const response = await fetch(PAYLOAD_ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "text/plain",
					"Authorization": `Bearer ${auth.token}`,
				},
				body: JSON.stringify(payload),
				credentials: "include",
			});
			const responseText = await response.text();
			let responseData = null;
			try {
				responseData = responseText ? JSON.parse(responseText) : null;
			} catch (parseError) {
				console.warn("X Buddy upload response was not JSON", parseError);
			}

			console.log("X Buddy upload response", {
				status: response.status,
				ok: response.ok,
				body: responseData ?? responseText,
			});

			if (response.status === 401) {
				await handleUnauthorized();
				throw new Error("Unauthorized");
			}

			if (!response.ok) {
				const message = responseData?.error || responseData?.message || (responseText && responseText.trim().length ? responseText : `Upload failed with status ${response.status}`);
				throw new Error(message);
			}

			if (!silent) {
				setStatus("Locations uploaded successfully.", "success");
			}
			return true;
		} catch (error) {
			console.error("X Buddy upload failed", error);
			if (!silent) setStatus(error?.message || "Upload failed.", "error");
			return false;
		} finally {
			if (!silent) setButtonLoading(uploadLocationsBtn, false);
		}
	};

	const runSignatureSync = async ({ silent = false } = {}) => {
		if (syncInProgress) return;
		const auth = await readAuthState();
		if (!auth?.token) {
			if (!silent) setStatus("Not logged in.", "error");
			return;
		}

		syncInProgress = true;
		if (!silent) {
			setStatus("Syncing signature repository...");
			setButtonLoading(syncLocationsBtn, true, "Syncing…");
		}

		try {
			const signatureState = await readSignatureVersionState();
			let currentVersion = signatureState.version || 0;
			const manifestUrl = new URL(MANIFEST_ENDPOINT);
			manifestUrl.searchParams.set("currentVersion", String(currentVersion));

			const manifest = await fetchJsonWithAuth(manifestUrl.toString(), auth.token, { description: "signature manifest" });
			if (!manifest || typeof manifest !== "object") {
				throw new Error("Manifest response was empty.");
			}

			let cache = null;
			if (manifest.strategy === "base+delta" || (currentVersion === 0 && manifest.currentBase)) {
				const baseInfo = manifest.currentBase;
				if (!baseInfo?.url || typeof baseInfo.version !== "number") {
					throw new Error("Manifest missing base snapshot information.");
				}
				const baseData = await fetchJsonWithAuth(resolveApiUrl(baseInfo.url), auth.token, {
					description: `base snapshot v${baseInfo.version}`,
					expectCompressed: true,
				});
				cache = await applyBaseSnapshot(baseData, baseInfo.version);
				currentVersion = baseInfo.version;
				await writeSignatureVersionState({ version: currentVersion, lastSyncedAt: Date.now() });
				await updateSignatureBadge();
			} else {
				cache = await readLocationCache();
			}

			const deltas = Array.isArray(manifest.deltas) ? manifest.deltas : [];
			for (const deltaInfo of deltas) {
				if (!deltaInfo?.url || typeof deltaInfo.toVersion !== "number") continue;
				const deltaData = await fetchJsonWithAuth(resolveApiUrl(deltaInfo.url), auth.token, {
					description: `delta ${deltaInfo.fromVersion ?? currentVersion}->${deltaInfo.toVersion}`,
					expectCompressed: true,
				});
				cache = await applyDeltaSnapshot(deltaData, cache);
				currentVersion = deltaInfo.toVersion;
				await writeSignatureVersionState({ version: currentVersion, lastSyncedAt: Date.now() });
				await updateSignatureBadge();
			}

			if (!silent) {
				setStatus("Signatures synced. Uploading observations…");
			}

			await uploadLocationCache({ silent: true, authOverride: auth });
			if (!silent) {
				setStatus("Sync complete.", "success");
			}
		} catch (error) {
			console.error("X Buddy signature sync failed", error);
			if (!silent) setStatus(error?.message || "Failed to sync signatures.", "error");
		} finally {
			syncInProgress = false;
			if (!silent) setButtonLoading(syncLocationsBtn, false);
		}
	};

	loginForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const email = emailInput?.value?.trim();
		const password = passwordInput?.value;
		if (!email || !password) {
			setStatus("Enter email and password.", "error");
			return;
		}

		setLoginLoading(true);
		setStatus("Signing in...");
		try {
			const formData = new FormData();
			formData.append("email", email);
			formData.append("password", password);

			const response = await fetch(AUTH_ENDPOINT, {
				method: "POST",
				body: formData,
				credentials: "include",
			});

			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				const message = data?.error || "Login failed.";
				throw new Error(message);
			}

			if (!data?.token || !data?.user) {
				throw new Error("Unexpected response from server.");
			}

			await writeAuthState({
				token: data.token,
				user: data.user,
				loggedIn: true,
				storedAt: Date.now(),
			});

			setStatus("Logged in successfully.", "success");
			passwordInput.value = "";
			await updateUi();
		} catch (error) {
			console.error("X Buddy auth failed", error);
			setStatus(error?.message || "Login failed.", "error");
		} finally {
			setLoginLoading(false);
		}
	});

	registerBtn?.addEventListener("click", () => {
		browser.tabs.create({ url: REGISTER_URL });
	});

	logoutBtn?.addEventListener("click", async (event) => {
		event.preventDefault();
		autoSyncTriggered = false;
		await clearAuthState();
		await updateUi();
	});

	syncLocationsBtn?.addEventListener("click", () => {
		runSignatureSync();
	});

	uploadLocationsBtn?.addEventListener("click", () => {
		uploadLocationCache();
	});

	updateUi();
});
