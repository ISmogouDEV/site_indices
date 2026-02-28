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

    for (const [name, code] of Object.entries(INDICATORS)) {
        try {
            // Fetch last 5 years
            const startYear = today.getFullYear() - 5;
            const startDate = `01/01/${startYear}`;

            const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${startDate}&dataFinal=${todayStr}`;

            const response = await fetch(url);
            if (!response.ok) continue;

            const data = await response.json();

            for (const item of data) {
                const dateParts = item.data.split('/');
                const isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                const value = parseFloat(item.valor);

                await client.sql`
                    INSERT INTO indicators (name, date, value)
                    VALUES (${name}, ${isoDate}, ${value})
                    ON CONFLICT (name, date) DO UPDATE SET value = EXCLUDED.value;
                `;
            }
            console.log(`Synced ${name}`);
        } catch (error) {
            console.error(`Error syncing ${name}:`, error);
        }
    }
}
