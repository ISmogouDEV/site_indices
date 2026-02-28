import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkAndSync } from '@/lib/sync-utils';

export async function GET() {
    try {
        // Automatic sync check
        // We run it for both dev and prod if the DB vars are present
        let syncStatus = null;
        try {
            syncStatus = await checkAndSync();
        } catch (err) {
            console.error("Sync pre-check error:", err);
        }

        const { rows: data } = await sql`
            SELECT name, date::text as date, value 
            FROM indicators 
            ORDER BY date ASC
        `;

        if (data.length === 0) {
            return NextResponse.json({
                message: "Database is being populated. Please refresh in 20 seconds.",
                debug: syncStatus
            });
        }

        // Group by indicator
        const grouped = data.reduce((acc, curr) => {
            if (!acc[curr.name]) {
                acc[curr.name] = [];
            }
            acc[curr.name].push(curr);
            return acc;
        }, {});

        // Process each series to calculate accumulations
        const processed = {};
        Object.keys(grouped).forEach(name => {
            const series = grouped[name];
            let currentIdx = 100;
            const results = [];

            for (let i = 0; i < series.length; i++) {
                const current = series[i];
                const valFactor = 1 + (current.value / 100);

                // Nº Índice (Cumulative growth base 100)
                currentIdx = currentIdx * valFactor;

                // YTD (Cumulative growth since January of current year)
                const currDate = new Date(current.date + 'T12:00:00Z');
                const currYear = currDate.getUTCFullYear();
                let ytdFactor = 1;
                for (let j = i; j >= 0; j--) {
                    const prevDate = new Date(series[j].date + 'T12:00:00Z');
                    if (prevDate.getUTCFullYear() !== currYear) break;
                    ytdFactor *= (1 + (series[j].value / 100));
                }
                const ytd = (ytdFactor - 1) * 100;

                // L12M (Cumulative growth of last 12 months)
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
            processed[name] = results.reverse(); // Newest first
        });

        // Get latest for each
        const latest = Object.keys(processed).reduce((acc, name) => {
            acc[name] = processed[name][0];
            return acc;
        }, {});

        return NextResponse.json({
            latest,
            history: processed
        });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
    }
}
