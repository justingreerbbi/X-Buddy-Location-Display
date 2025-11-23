// Options script
const LOCATION_STORAGE_KEY = 'xbuddyLocationCache';

document.addEventListener('DOMContentLoaded', () => {
    const debugCheckbox = document.getElementById('debug');
    const saveButton = document.getElementById('save');
    const exportButton = document.getElementById('exportCsv');
    const importInput = document.getElementById('importCsv');
    const importButton = document.getElementById('importCsvButton');
    const statusField = document.getElementById('status');
    const totalEntriesField = document.getElementById('totalEntries');
    const uniqueLocationsField = document.getElementById('uniqueLocations');
    const breakdownList = document.getElementById('locationBreakdown');

    const setStatus = (message, isError = false) => {
        if (!statusField) return;
        statusField.textContent = message || '';
        statusField.style.color = isError ? 'red' : '';
    };

    const refreshStats = () => {
        if (!totalEntriesField || !uniqueLocationsField || !breakdownList) return;
        updateStats(totalEntriesField, uniqueLocationsField, breakdownList).catch((error) => {
            console.error('X Buddy stats refresh failed', error);
        });
    };

    chrome.storage.sync.get('debug', (data) => {
        if (debugCheckbox) {
            debugCheckbox.checked = data.debug || false;
        }
    });

    saveButton?.addEventListener('click', () => {
        if (!debugCheckbox) return;
        chrome.storage.sync.set({ debug: debugCheckbox.checked }, () => {
            alert('Settings saved!');
        });
    });

    exportButton?.addEventListener('click', async () => {
        setStatus('Preparing CSV export...');
        try {
            const count = await exportLocationCsv();
            setStatus(count ? `Exported ${count} entr${count === 1 ? 'y' : 'ies'}.` : 'No cached entries found.');
            refreshStats();
        } catch (error) {
            console.error('X Buddy export failed', error);
            setStatus('Failed to export CSV. See console for details.', true);
        }
    });

    importButton?.addEventListener('click', async () => {
        if (!importInput || !importInput.files?.length) {
            setStatus('Choose a CSV file to import.', true);
            return;
        }

        const [file] = importInput.files;
        setStatus('Syncing entries from CSV...');
        try {
            const imported = await importLocationsFromCsv(file);
            importInput.value = '';
            setStatus(`Synced ${imported} entr${imported === 1 ? 'y' : 'ies'} from CSV.`);
            refreshStats();
        } catch (error) {
            console.error('X Buddy import failed', error);
            setStatus(error?.message || 'Failed to import CSV. See console for details.', true);
        }
    });

    refreshStats();
});

async function exportLocationCsv() {
    const cache = await readLocationCache();
    const entries = Object.entries(cache);
    const lines = ['username,location,timestamp'];

    entries.forEach(([username, info]) => {
        const location = typeof info?.location === 'string' ? info.location : '';
        const timestamp = info?.timestamp ? String(info.timestamp) : '';
        lines.push([
            escapeCsvValue(username),
            escapeCsvValue(location),
            escapeCsvValue(timestamp),
        ].join(','));
    });

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadLink.download = `xbuddy-locations-${stamp}.csv`;
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return entries.length;
}

async function importLocationsFromCsv(file) {
    const text = await file.text();
    const rows = parseCsvRows(text);
    if (!rows.length) {
        throw new Error('No valid rows found in CSV.');
    }

    const existing = await readLocationCache();
    let updateCount = 0;

    rows.forEach((row) => {
        const username = normalizeUsername(row.username);
        if (!username) return;

        existing[username] = {
            location: row.location || null,
            timestamp: Number.isFinite(row.timestamp) ? row.timestamp : Date.now(),
        };
        updateCount += 1;
    });

    if (!updateCount) {
        throw new Error('No valid username entries detected in CSV.');
    }

    await writeLocationCache(existing);
    return updateCount;
}

function parseCsvRows(csvText) {
    if (!csvText) return [];
    const sanitized = csvText.replace(/^\uFEFF/, '');
    const lines = sanitized.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return [];

    const headerCells = splitCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
    const hasHeader = headerCells.includes('username');
    const columnMap = {
        username: hasHeader ? headerCells.indexOf('username') : 0,
        location: hasHeader ? headerCells.indexOf('location') : 1,
        timestamp: hasHeader ? headerCells.indexOf('timestamp') : 2,
    };

    const startIndex = hasHeader ? 1 : 0;
    const rows = [];

    for (let i = startIndex; i < lines.length; i += 1) {
        const cells = splitCsvLine(lines[i]);
        const username = columnMap.username >= 0 ? cells[columnMap.username] : cells[0];
        if (!username || !username.trim()) continue;

        const location = columnMap.location >= 0 ? cells[columnMap.location] : cells[1] || '';
        const timestampRaw = columnMap.timestamp >= 0 ? cells[columnMap.timestamp] : cells[2] || '';
        const timestamp = timestampRaw && timestampRaw.trim() ? Number(timestampRaw) : NaN;

        rows.push({
            username: username.trim(),
            location: location?.trim() || '',
            timestamp: Number.isFinite(timestamp) ? timestamp : NaN,
        });
    }

    return rows;
}

function splitCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values;
}

function escapeCsvValue(value) {
    const text = value == null ? '' : String(value);
    if (text === '') return '';
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function normalizeUsername(raw) {
    if (!raw) return '';
    return raw.replace(/^@+/, '').trim();
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

async function updateStats(totalEl, uniqueEl, listEl) {
    const cache = await readLocationCache();
    const entries = Object.entries(cache);
    totalEl.textContent = String(entries.length);

    const counts = new Map();
    entries.forEach(([, info]) => {
        const loc = (info?.location || '').trim();
        if (!loc) return;
        counts.set(loc, (counts.get(loc) || 0) + 1);
    });

    uniqueEl.textContent = String(counts.size);
    listEl.innerHTML = '';

    const totalWithLocation = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    if (!totalWithLocation) {
        const empty = document.createElement('li');
        empty.textContent = 'No locations collected yet.';
        empty.style.color = 'var(--muted)';
        listEl.appendChild(empty);
        return;
    }

    const items = Array.from(counts.entries()).sort((a, b) => {
        if (b[1] === a[1]) return a[0].localeCompare(b[0]);
        return b[1] - a[1];
    });

    items.forEach(([location, count]) => {
        const percent = formatPercentage((count / totalWithLocation) * 100);
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = location;
        const value = document.createElement('span');
        value.textContent = `${percent}% · ${count}`;
        li.append(name, value);
        listEl.appendChild(li);
    });
}

function formatPercentage(value) {
    if (!Number.isFinite(value)) return '0';
    if (value >= 10) return value.toFixed(0);
    const rounded = value.toFixed(1);
    return rounded.replace(/\.0$/, '');
}