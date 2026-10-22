import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('Pemakaian: npm run hash-password:worker -- "password-rahasia"');
  process.exit(1);
}

const iterations = 210_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const value = `pbkdf2$${iterations}$${salt.toString('base64url')}$${hash.toString('base64url')}`;

console.log('');
console.log('  ADMIN_PASSWORD_HASH untuk Cloudflare Worker:');
console.log(`  ${value}`);
console.log('');
console.log('  Simpan dengan: wrangler secret put ADMIN_PASSWORD_HASH --config worker/wrangler.toml');
console.log('');
