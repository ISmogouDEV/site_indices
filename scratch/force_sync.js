
import { checkAndSync } from '../lib/sync-utils.js';

async function force() {
    console.log("Starting forced sync...");
    try {
        const result = await checkAndSync(true);
        console.log("Sync result:", result);
    } catch (e) {
        console.error("Sync failed:", e);
    } finally {
        process.exit();
    }
}

force();
