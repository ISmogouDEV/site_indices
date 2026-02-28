import { db } from '@vercel/postgres';

const INDICATORS = {
    'SELIC': 11,
    'CDI': 12,
    'IPCA': 433,
    'IGP-M': 189,
    'IGP-DI': 190,
    'IPC-FIPE': 193,
    'TR': 226
};

export async function checkAndSync() {
    const client = await db.connect();

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

        // Check if we need sync (check for the latest IPCA as reference)
        const { rows } = await client.sql`
            SELECT MAX(date) as last_date FROM indicators WHERE name = 'IPCA'
        `;

        const lastDate = rows[0]?.last_date;
        const today = new Date();
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        let needsSync = false;
        if (!lastDate) {
            needsSync = true;
        } else {
            const lastEntryDate = new Date(lastDate);
            // If the last entry is not from this month (or previous if it's too early), sync
            // Indices usually publish with 1 month delay, but we sync if we haven't checked recently
            if (lastEntryDate.getUTCFullYear() < currentYear || lastEntryDate.getUTCMonth() < currentMonth) {
                needsSync = true;
            }
        }

        if (needsSync) {
            console.log("Triggering auto-sync...");
            await performSync(client);
        }
    } finally {
        client.release();
    }
}

async function performSync(client) {
    const today = new Date();
    const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    console.log(`[SYNC] Starting sync for ${Object.keys(INDICATORS).length} indicators...`);

    for (const [name, code] of Object.entries(INDICATORS)) {
        try {
            const startYear = today.getFullYear() - 5;
            const startDate = `01/01/${startYear}`;
            const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${startDate}&dataFinal=${todayStr}`;

            console.log(`[SYNC] Fetching ${name} (SGS ${code})...`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.error(`[SYNC] API error for ${name}: ${response.status} ${response.statusText}`);
                continue;
            }

            const data = await response.json();
            if (!Array.isArray(data)) {
                console.error(`[SYNC] Unexpected data format for ${name}:`, data);
                continue;
            }

            console.log(`[SYNC] Processing ${data.length} entries for ${name}...`);

            for (const item of data) {
                const dateParts = item.data.split('/');
                if (dateParts.length !== 3) continue;

                const isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                // SGS uses comma as decimal separator
                const valueStr = item.valor.toString().replace(',', '.');
                const value = parseFloat(valueStr);

                if (isNaN(value)) continue;

                await client.sql`
                    INSERT INTO indicators (name, date, value)
                    VALUES (${name}, ${isoDate}, ${value})
                    ON CONFLICT (name, date) DO UPDATE SET value = EXCLUDED.value;
                `;
            }
            console.log(`[SYNC] Success: ${name} updated.`);
        } catch (error) {
            console.error(`[SYNC] Exception during ${name} sync:`, error);
        }
    }
    console.log("[SYNC] All indicators processed.");
}
