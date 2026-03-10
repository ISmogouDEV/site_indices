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
        // Create table if not exists
        await client.sql`
            CREATE TABLE IF NOT EXISTS indicators (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                date DATE NOT NULL,
                value REAL NOT NULL,
                UNIQUE(name, date)
            );
        `;

        if (force) {
            console.log("[SYNC] Forced sync triggered.");
            await performSync(client);
            return true;
        }

        // Check newest data points for ALL indicators to see if we need sync
        const { rows: lastDates } = await client.sql`
            SELECT name, MAX(date) as last_date FROM indicators GROUP BY name
        `;

        const today = new Date();
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        let needsSync = false;

        // Strategy 1: Check if we have any data at all
        if (lastDates.length === 0) {
            console.log("[SYNC] Database empty. Triggering full sync...");
            needsSync = true;
        } else {
            // Strategy 2: Check if any of our monitored indicators are missing the current month
            // We consider it "stale" if the latest date we have is from a previous month
            for (const [name, code] of Object.entries(INDICATORS)) {
                const entry = lastDates.find(r => r.name === name);
                if (!entry) {
                    console.log(`[SYNC] Missing indicator ${name}. Triggering sync...`);
                    needsSync = true;
                    break;
                }

                const lastEntryDate = new Date(entry.last_date);
                if (lastEntryDate.getUTCFullYear() < currentYear || lastEntryDate.getUTCMonth() < currentMonth) {
                    // It's possible the data isn't in BCB yet, but we should check
                    console.log(`[SYNC] ${name} might be out of date (last: ${entry.last_date}). Checking BCB...`);
                    needsSync = true;
                    break;
                }
            }

            // Strategy 3: Check for historical gaps if we already have data
            if (!needsSync) {
                const { rows: firstDates } = await client.sql`
                    SELECT MIN(date) as first_date FROM indicators
                `;
                const firstDate = firstDates[0]?.first_date;
                if (firstDate) {
                    const firstEntryDate = new Date(firstDate);
                    if (firstEntryDate.getUTCFullYear() > 1994) {
                        console.log(`[SYNC] Historical gap detected. Expanding...`);
                        needsSync = true;
                    }
                }
            }
        }

        if (needsSync) {
            await performSync(client);
            return true;
        }
        return false;
    } finally {
        client.release();
    }
}

async function performSync(client) {
    const today = new Date();
    const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    console.log(`[SYNC] Starting optimized bulk sync...`);

    for (const [name, code] of Object.entries(INDICATORS)) {
        try {
            // Fetch history since 1993 for indices, shorter for Selic/CDI if preferred, 
            // but for simplicity mirroring fetch_data.py logic
            const startYear = (name === 'SELIC' || name === 'CDI') ? today.getFullYear() - 5 : 1993;
            const startDate = `01/01/${startYear}`;
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
                console.log(`[SYNC] No data returned for ${name}`);
                continue;
            }

            console.log(`[SYNC] Bulk inserting ${data.length} rows for ${name}...`);

            await client.sql`BEGIN`;

            for (const item of data) {
                const dateParts = item.data.split('/');
                if (dateParts.length !== 3) continue;

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
            console.log(`[SYNC] ${name} sync successful.`);
        } catch (error) {
            try { await client.sql`ROLLBACK`; } catch (e) { }
            console.error(`[SYNC] Error with ${name}:`, error);
        }
    }
    console.log("[SYNC] Optimized sync process finished.");
}
