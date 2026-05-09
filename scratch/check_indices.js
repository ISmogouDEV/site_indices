
import { getClient } from '../lib/db.js';
import fetch from 'node-fetch';

async function check() {
    const client = await getClient();
    try {
        const { rows } = await client.sql`SELECT name, MAX(date) as last_date FROM indicators GROUP BY name`;
        console.log("Current DB state:", rows);

        const codes = { 'IGP-M': 189, 'IGP-DI': 190 };
        for (const [name, code] of Object.entries(codes)) {
            const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
            const res = await fetch(url);
            const data = await res.json();
            console.log(`BCB Latest for ${name}:`, data);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

check();
