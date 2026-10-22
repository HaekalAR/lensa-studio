import { randomBytes } from 'node:crypto';

const sessionSecret = randomBytes(32).toString('hex');
const ingestToken = randomBytes(24).toString('base64url');

console.log('');
console.log('  Salin ke secret Cloudflare Worker:');
console.log('');
console.log(`  SESSION_SECRET=${sessionSecret}`);
console.log(`  INGEST_TOKEN=${ingestToken}`);
console.log('');
console.log('  Simpan dengan:');
console.log('    wrangler secret put SESSION_SECRET --config worker/wrangler.toml');
console.log('    wrangler secret put INGEST_TOKEN --config worker/wrangler.toml');
console.log('');
console.log('  Jangan commit nilai-nilai ini.');
console.log('');
