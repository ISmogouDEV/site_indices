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

            // Re-fetch data after sync
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
            // Update local data variable with refreshed results
            data.length = 0;
            data.push(...refreshedData);
        } else {
            // NON-BLOCKING SYNC: Trigger update in background
            // We use a self-invoking async function to avoid blocking the main thread
            // while still allowing the runtime a chance to process it.
            (async () => {
                try {
                    console.log("[API] Background sync check started...");
                    const updated = await checkAndSync();
                    if (updated) console.log("[API] Background sync found and saved new data.");
                } catch (err) {
                    console.error("[SYNC ERROR]", err);
                }
            })();
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
        // s-maxage=60: Shared cache for 1 minute
        // stale-while-revalidate=300: Serve stale for only 5 minutes (was 1 hour)
        const cacheControl = forceSync 
            ? 'no-store, no-cache, must-revalidate, proxy-revalidate' 
            : 's-maxage=60, stale-while-revalidate=300';

        return NextResponse.json({
            latest,
            history: processed
        }, {
            headers: {
                'Cache-Control': cacheControl,
            }
        });

    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
    }
}
