// Generates a 2048-bit DKIM key pair and prints the DNS TXT record to publish.
// Usage: node scripts/dkim-keygen.js <selector> <domain> [output-dir]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const [selector, domain, dir = './keys'] = process.argv.slice(2);
if (!selector || !domain) { console.error('Usage: node scripts/dkim-keygen.js <selector> <domain> [output-dir]'); process.exit(1); }
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `${selector}.${domain}.private.pem`);
fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
const der = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
console.log(`Private key written to ${file} (keep it secret; set DKIM_PRIVATE_KEY_PATH to this file).\n`);
console.log('Publish this DNS TXT record:\n');
console.log(`  Name:  ${selector}._domainkey.${domain}`);
console.log(`  Value: v=DKIM1; k=rsa; p=${der}\n`);
