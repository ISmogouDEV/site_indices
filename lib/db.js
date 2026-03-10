import { sql as vercelSql, db as vercelDb } from '@vercel/postgres';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

const isLocal = !process.env.POSTGRES_URL;

let sqliteDb = null;

async function getSqliteDb() {
    if (!sqliteDb) {
        const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        sqliteDb = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
    }
    return sqliteDb;
}

export async function query(text, params = []) {
    if (!isLocal) {
        // Fallback to vercel sql template literal isn't direct here, 
        // but we can use vercelDb for non-template queries
        const client = await vercelDb.connect();
        try {
            return await client.query(text, params);
        } finally {
            client.release();
        }
    }

    const db = await getSqliteDb();
    // Translate Postgres cast to SQLite
    const sqliteSql = text.replace(/date::text as date/g, 'date');
    const rows = await db.all(sqliteSql, params);
    return { rows };
}

// Helper to simulate vercel's sql tagged template
export async function sql(strings, ...values) {
    if (!isLocal) {
        return vercelSql(strings, ...values);
    }

    const db = await getSqliteDb();
    const text = strings.reduce((acc, str, i) => acc + str + (i < values.length ? '?' : ''), '');

    // Simple translation for the project's specific queries
    let sqliteSql = text
        .replace(/date::text as date/g, 'date')
        .replace(/ON CONFLICT \(name, date\) DO UPDATE SET value = EXCLUDED\.value/i, '')
        .trim();

    if (text.toLowerCase().includes('insert into') && text.toLowerCase().includes('on conflict')) {
        sqliteSql = sqliteSql.replace(/INSERT INTO/i, 'INSERT OR REPLACE INTO');
    }

    if (sqliteSql.toLowerCase().startsWith('select')) {
        const rows = await db.all(sqliteSql, values);
        return { rows };
    } else {
        const result = await db.run(sqliteSql, values);
        return { rows: [], lastID: result.lastID, changes: result.changes };
    }
}

export async function getClient() {
    if (!isLocal) {
        const client = await vercelDb.connect();
        // Wrap the client to provide the same .sql template tag interface as local/vercelSql
        return {
            ...client,
            sql: async (strings, ...values) => {
                const queryText = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '');
                return client.query(queryText, values);
            },
            release: () => client.release(),
        };
    }

    const db = await getSqliteDb();
    return {
        sql: async (strings, ...values) => {
            return sql(strings, ...values);
        },
        release: () => { }, // No-op for sqlite in this simple wrapper
    };
}
