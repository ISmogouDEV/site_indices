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
            // RISCO-01: Authenticate forced sync
            if (forceSync) {
                const token = searchParams.get('token');
                const authHeader = request.headers.get('authorization');
                const cronToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
                
                const serverToken = process.env.SYNC_TOKEN;
                const cronSecret = process.env.CRON_SECRET;
                
                if (!serverToken && !cronSecret) {
                    console.error("[SECURITY] Neither SYNC_TOKEN nor CRON_SECRET configured in Vercel.");
                    return NextResponse.json({ error: 'Erro de configuração: Servidor sem chaves de acesso.' }, { status: 500 });
                }

                const isAuthorized = (token && token === serverToken) || (cronToken && cronToken === cronSecret);

                if (!isAuthorized) {
                    console.warn("[SECURITY] Unauthorized sync attempt.");
                    return NextResponse.json({ 
                        error: 'Acesso negado: Token inválido ou ausente.',
                        code: 'AUTH_ERROR'
                    }, { status: 401 });
                }
            }

            // BLOCKING SYNC: When database is empty or explicitly requested
            console.log(forceSync ? "[API] Forced sync authorized..." : "[API] Database empty, blocking for sync...");
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
            (async () => {
                try {
                    const updated = await checkAndSync();
                    if (updated) {
                        console.log("[API] Background sync: New data found and database updated.");
                    } else {
                        console.log("[API] Background sync: Data is already up to date.");
                    }
                } catch (err) {
                    // RISCO-04: Sanitize production logs
                    if (process.env.NODE_ENV === 'production') {
                        console.error("[SYNC ERROR]", err.message);
                    } else {
                        console.error("[SYNC ERROR]", err);
                    }
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

        // Step 4: Return with Caching & Security Headers
        const cacheControl = forceSync 
            ? 'no-store, no-cache, must-revalidate, proxy-revalidate' 
            : 's-maxage=60, stale-while-revalidate=300';

        // RISCO-07: Explicit CORS (Restrictive in production)
        const origin = request.headers.get('origin');
        const isAllowedOrigin = process.env.NODE_ENV === 'development' || (origin && origin.includes('vercel.app'));
        
        const headers = {
            'Cache-Control': cacheControl,
            'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'X-Content-Type-Options': 'nosniff'
        };

        return NextResponse.json({
            latest,
            history: processed
        }, { headers });

    } catch (error) {
        // RISCO-04: Sanitize production logs
        if (process.env.NODE_ENV === 'production') {
            console.error('Database error:', error.message);
        } else {
            console.error('Database error:', error);
        }
        return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
    }
}
