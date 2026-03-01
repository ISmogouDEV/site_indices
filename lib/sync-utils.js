import { getClient } from './db';

const INDICATORS = {
    'IPCA': 433,
    'IGP-M': 189,
    'IGP-DI': 190,
    'IPC-FIPE': 193
};

export async function checkAndSync() {
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

        // Check both newest and oldest data points to see if we need sync OR historical expansion
        const { rows } = await client.sql`
            SELECT MAX(date) as last_date, MIN(date) as first_date FROM indicators WHERE name = 'IPCA'
        `;

        const lastDate = rows[0]?.last_date;
        const firstDate = rows[0]?.first_date;
        const today = new Date();
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        let needsSync = false;

        if (!lastDate) {
            needsSync = true;
        } else {
            const lastEntryDate = new Date(lastDate);
            const firstEntryDate = new Date(firstDate);

            // Check 1: We are missing recent data (New Month)
            if (lastEntryDate.getUTCFullYear() < currentYear || lastEntryDate.getUTCMonth() < currentMonth) {
                needsSync = true;
            }

            // Check 2: We are missing old history (Expansion requested)
            // If the earliest date is later than 1994, we need to fetch the past
            if (firstEntryDate.getUTCFullYear() > 1994) {
                console.log(`[SYNC] Historical gap detected. Earliest date is ${firstDate}. Expanding...`);
                needsSync = true;
            }
        }

        if (needsSync) {
            console.log(`[SYNC] Triggering sync in progress...`);
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
            // Fetch history since 1993 as requested by user
            const startYear = 1993;
            const startDate = `01/01/${startYear}`;
            const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${startDate}&dataFinal=${todayStr}`;

            console.log(`[SYNC] Fetching ${name}...`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) continue;

            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) continue;

            console.log(`[SYNC] Bulk inserting ${data.length} rows for ${name}...`);

            // Prepare batch values
            // We'll use a transaction for safety and speed
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
            console.log(`[SYNC] ${name} bulk sync successful.`);
        } catch (error) {
            await client.sql`ROLLBACK`;
            console.error(`[SYNC] Error with ${name}:`, error);
        }
    }
    console.log("[SYNC] Optimized sync process finished.");
}
