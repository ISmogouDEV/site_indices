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

        // Check for each major indicator
        const { rows: stats } = await client.sql`
            SELECT name, COUNT(*) as count, MAX(date) as last_date 
            FROM indicators 
            GROUP BY name
        `;

        console.log("[SYNC] Database stats:", stats);

        const indicesFound = stats.map(s => s.name);
        const requiredIndices = ['IPCA', 'IGP-M', 'IGP-DI', 'IPC-FIPE'];
        const missingIndices = requiredIndices.filter(name => !indicesFound.includes(name));

        const lastIPCA = stats.find(s => s.name === 'IPCA')?.last_date;
        const today = new Date();
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        let needsSync = missingIndices.length > 0;

        if (!needsSync && lastIPCA) {
            const lastEntryDate = new Date(lastIPCA);
            // Sync if the last entry is old
            if (lastEntryDate.getUTCFullYear() < currentYear || lastEntryDate.getUTCMonth() < currentMonth) {
                needsSync = true;
            }
        }

        if (needsSync) {
            console.log(`[SYNC] Triggering sync. Missing indices or data is old.`);
            await performSync(client);
        }

        return { stats };
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
            // Fetch last 10 years (good balance for history vs performance)
            const startYear = today.getFullYear() - 10;
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
