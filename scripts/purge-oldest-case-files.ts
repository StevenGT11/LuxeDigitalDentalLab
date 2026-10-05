import { createClient } from '@supabase/supabase-js';
import { purgeOldestCaseFiles } from '../src/lib/lab/purge-case-files.server.ts';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error('Faltan PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

const admin = createClient(url, key, {
	auth: { autoRefreshToken: false, persistSession: false }
});

const result = await purgeOldestCaseFiles(admin);
const mb = (result.bytesFreed / (1024 * 1024)).toFixed(1);
const before = (result.bytesBefore / (1024 * 1024)).toFixed(1);
console.log(
	JSON.stringify({
		skipped: result.skipped,
		filesDeleted: result.filesDeleted,
		casesTouched: result.casesTouched,
		mbFreed: mb,
		mbBefore: before
	})
);
