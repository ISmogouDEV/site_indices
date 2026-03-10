import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { checkAndSync } from '@/lib/sync-utils';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceSync = searchParams.get('sync') === 'true';

        // Step 1: Pre-fetch data to check if DB is empty
        const { rows: data } = await sql`
            SELECT name, date::text as date, value 
            FROM indicators 
            ORDER BY date ASC
        `;

        // Step 2: Adaptive Sync
        if (data.length === 0 || forceSync) {
            // BLOCKING SYNC: When database is empty or explicitly requested
            console.log(forceSync ? "[API] Forced sync requested..." : "[API] Database empty, blocking for sync...");
            await checkAndSync(forceSync);

            // Re-fetch data after sync if it was blocking
            const { rows: refreshedData } = await sql`
                SELECT name, date::text as date, value 
                FROM indicators 
                ORDER BY date ASC
            `;

            if (refreshedData.length === 0) {
                return NextResponse.json({
                    message: "Database is being populated. Please refresh in 20 seconds.",
                    status: "syncing"
                });
            }
            // Use refreshed data for processing below
            data.splice(0, data.length, ...refreshedData);
        } else {
            // BACKGROUND SYNC: non-blocking
            console.log("[API] Triggering background sync if needed...");
            checkAndSync().catch(err => console.error("[API] Background sync error:", err));
        }

        // Step 3: Process the data
        const grouped = data.reduce((acc, curr) => {
            if (!acc[curr.name]) {
                acc[curr.name] = [];
            }
            acc[curr.name].push(curr);
            return acc;
        }, {});

        const processed = {};
        Object.keys(grouped).forEach(name => {
            const series = grouped[name];
            let currentIdx = 100;
            const results = [];

            for (let i = 0; i < series.length; i++) {
                const current = series[i];
                const valFactor = 1 + (current.value / 100);
                currentIdx = currentIdx * valFactor;

                const currDate = new Date(current.date + 'T12:00:00Z');
                const currYear = currDate.getUTCFullYear();
                let ytdFactor = 1;
                for (let j = i; j >= 0; j--) {
                    const prevDate = new Date(series[j].date + 'T12:00:00Z');
                    if (prevDate.getUTCFullYear() !== currYear) break;
                    ytdFactor *= (1 + (series[j].value / 100));
                }
                const ytd = (ytdFactor - 1) * 100;

                let l12m = null;
                if (i >= 11) {
                    let l12mFactor = 1;
                    for (let j = i; j > i - 12; j--) {
                        l12mFactor *= (1 + (series[j].value / 100));
                    }
                    l12m = (l12mFactor - 1) * 100;
                }

                results.push({
                    ...current,
                    indexNumber: currentIdx,
                    ytd: ytd,
                    l12m: l12m
                });
            }
            processed[name] = results.reverse();
        });

        const latest = Object.keys(processed).reduce((acc, name) => {
            acc[name] = processed[name][0];
            return acc;
        }, {});

        // Step 4: Return with Caching Headers
        // s-maxage=60: Shared cache for 1 minute (reduced for better sync responsiveness)
        // stale-while-revalidate=86400: Serve stale for up to 24h while updating in background
        return NextResponse.json({
            latest,
            history: processed
        }, {
            headers: {
                'Cache-Control': 's-maxage=60, stale-while-revalidate=86400',
            }
        });

    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
    }
}
