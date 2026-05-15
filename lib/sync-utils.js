import { getClient } from './db';

const INDICATORS = {
    'IPCA': 433,
    'IGP-M': 189,
    'IGP-DI': 190,
    'IPC-FIPE': 193
};

export async function checkAndSync(force = false) {
    const client = await getClient();

    try {
        // Create tables if not exists
        await client.sql`
            CREATE TABLE IF NOT EXISTS indicators (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                date DATE NOT NULL,
                value REAL NOT NULL,
                UNIQUE(name, date)
            );
        `;
        
        await client.sql`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `;

        // ECONOMY CHECK: Skip if last sync was recent (within 4 hours)
        if (!force) {
            const { rows: meta } = await client.sql`SELECT value FROM sync_metadata WHERE key = 'last_sync_all'`;
            if (meta.length > 0) {
                const lastSync = new Date(meta[0].value);
                const now = new Date();
                const diffHours = (now - lastSync) / (1000 * 60 * 60);
                
                if (diffHours < 4) {
                    console.log(`[ECONOMY] Sync skipped. Last check was ${diffHours.toFixed(2)}h ago.`);
                    return false;
                }
            }
        }

        // Get the latest date for each indicator
        const { rows: lastDates } = await client.sql`
            SELECT name, MAX(date) as last_date FROM indicators GROUP BY name
        `;

        if (force) {
            console.log("[SYNC] Forced sync triggered.");
            await performSync(client, {}); // Empty map triggers full/default sync
            return true;
        }

        const today = new Date();
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        let needsSync = false;
        const syncMap = {};

        // Check if any of our monitored indicators are missing or out of date
        for (const [name, code] of Object.entries(INDICATORS)) {
            const entry = lastDates.find(r => r.name === name);
            if (!entry) {
                console.log(`[SYNC] Missing indicator ${name}.`);
                needsSync = true;
                syncMap[name] = null; // Full sync for this one
                continue;
            }

            const lastEntryDate = new Date(entry.last_date);
            // Consider stale if we don't have data for the current month
            // or if it's after the 5th and we don't have the previous month's data
            const isDifferentMonth = lastEntryDate.getUTCFullYear() < currentYear || lastEntryDate.getUTCMonth() < currentMonth;
            
            if (isDifferentMonth) {
                console.log(`[SYNC] ${name} might be out of date (last: ${entry.last_date}).`);
                needsSync = true;
                syncMap[name] = entry.last_date;
            }
        }

        // Strategy 3: Check for historical gaps if we already have data (only if not already syncing)
        if (!needsSync && lastDates.length > 0) {
            const { rows: firstDates } = await client.sql`
                SELECT MIN(date) as first_date FROM indicators
            `;
            const firstDate = firstDates[0]?.first_date;
            if (firstDate) {
                const firstEntryDate = new Date(firstDate);
                if (firstEntryDate.getUTCFullYear() > 1994) {
                    console.log(`[SYNC] Historical gap detected. Expanding...`);
                    needsSync = true;
                    // For historical expansion, we just trigger a full sync for all
                }
            }
        }

        if (needsSync) {
            await performSync(client, syncMap);
            
            // Record this successful sync check for economy
            const nowIso = new Date().toISOString();
            await client.sql`
                INSERT INTO sync_metadata (key, value)
                VALUES ('last_sync_all', ${nowIso})
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
            `;
            return true;
        }
        return false;
    } finally {
        client.release();
    }
}

async function performSync(client, syncMap) {
    const today = new Date();
    const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    console.log(`[SYNC] Starting incremental sync...`);

    for (const [name, code] of Object.entries(INDICATORS)) {
        try {
            // Determine start date
            let startDate;
            const lastDateStr = syncMap[name];

            if (lastDateStr) {
                // Parse YYYY-MM-DD
                const parts = lastDateStr.split('-');
                // Go back 3 months from the last date to ensure we catch late updates, 
                // corrections, or indices published with delay (like IPCA)
                const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
                date.setMonth(date.getMonth() - 2); 
                
                startDate = `01/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
                console.log(`[SYNC] Incremental sync for ${name} (Last date in DB: ${lastDateStr}, fetching from ${startDate})`);
            } else {
                // Default history: 30 years
                const startYear = 1994;
                startDate = `01/01/${startYear}`;
                console.log(`[SYNC] Full sync for ${name} (No data in DB, fetching from ${startDate})`);
            }

            const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${startDate}&dataFinal=${todayStr}`;

            console.log(`[SYNC] Fetching ${name} from ${startDate}...`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) {
                console.error(`[SYNC] Failed to fetch ${name}: ${response.statusText}`);
                continue;
            }

            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) {
                console.log(`[SYNC] No data returned for ${name} (Status: ${response.status})`);
                continue;
            }

            console.log(`[SYNC] Found ${data.length} data points for ${name}.`);

            await client.sql`BEGIN`;

            for (const item of data) {
                // RISCO-06: Validate date format DD/MM/YYYY
                if (!/^\d{2}\/\d{2}\/\d{4}$/.test(item.data)) {
                    console.warn(`[SYNC] Invalid date format skipped: ${item.data}`);
                    continue;
                }

                const dateParts = item.data.split('/');

                const isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                const valueStr = item.valor.toString().replace(',', '.');
                const value = parseFloat(valueStr);

                if (isNaN(value)) continue;

                await client.sql`
                    INSERT INTO indicators (name, date, value)
                    VALUES (${name}, ${isoDate}, ${value})
                    ON CONFLICT (name, date) DO UPDATE SET value = EXCLUDED.value;
                `;
            }

            await client.sql`COMMIT`;
            console.log(`[SYNC] ${name} updated successfully.`);
        } catch (error) {
            try { await client.sql`ROLLBACK`; } catch (e) { }
            console.error(`[SYNC] Error with ${name}:`, error);
        }
    }
    console.log("[SYNC] Incremental sync process finished.");
}
