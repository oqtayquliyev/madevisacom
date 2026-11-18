// Copies every Storage bucket and file from the old Supabase project to the new one
// (self-hosted or another Supabase project). The database dump carries the bucket list and
// file records, but not the files themselves — this moves the files.
//
// Run from the project folder (needs Node 18+ and `npm install` done once):
//
//   OLD_URL=https://<old-ref>.supabase.co  OLD_SERVICE_KEY=<old service_role key> \
//   NEW_URL=https://api.madevisa.com        NEW_SERVICE_KEY=<new service_role key> \
//   node scripts/copy-storage.mjs
//
// Safe to run again: files that already exist on the new side are overwritten with the same bytes.
// Optional: BUCKETS=application-files,listing-images to copy only some buckets.

import { createClient } from '@supabase/supabase-js';

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing ${k}. See the comment at the top of scripts/copy-storage.mjs.`);
    process.exit(1);
  }
  return v;
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const from = createClient(need('OLD_URL'), need('OLD_SERVICE_KEY'), opts);
const to = createClient(need('NEW_URL'), need('NEW_SERVICE_KEY'), opts);
const only = (process.env.BUCKETS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Every file path in a bucket (folders are walked). */
async function listAll(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await from.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back without an id.
      if (item.id === null || item.id === undefined) out.push(...(await listAll(bucket, path)));
      else out.push({ path, type: item.metadata?.mimetype });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

const { data: buckets, error } = await from.storage.listBuckets();
if (error) {
  console.error('Could not read the old project (is it restricted or paused?):', error.message);
  process.exit(1);
}

let copied = 0;
let failed = 0;
for (const b of buckets.filter((b) => !only.length || only.includes(b.id))) {
  const made = await to.storage.createBucket(b.id, {
    public: b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  });
  if (made.error && !/exist/i.test(made.error.message)) console.warn(`bucket ${b.id}: ${made.error.message}`);

  const files = await listAll(b.id);
  console.log(`${b.id}: ${files.length} files`);
  for (const f of files) {
    const dl = await from.storage.from(b.id).download(f.path);
    if (dl.error) {
      failed++;
      console.warn(`  ✗ ${f.path}: ${dl.error.message}`);
      continue;
    }
    const up = await to.storage.from(b.id).upload(f.path, dl.data, { upsert: true, contentType: f.type || dl.data.type || undefined });
    if (up.error) {
      failed++;
      console.warn(`  ✗ ${f.path}: ${up.error.message}`);
    } else if (++copied % 100 === 0) console.log(`  … ${copied} copied`);
  }
}
console.log(`Done: ${copied} files copied, ${failed} failed.`);
process.exit(failed ? 2 : 0);
