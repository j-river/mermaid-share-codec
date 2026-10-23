import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../.artifacts/hf-space/', import.meta.url);
const expected = ['LICENSE', 'README.md', 'assets/app.js', 'assets/fflate.LICENSE', 'assets/style.css', 'build-info.json', 'index.html'];
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await files(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    else result.push(`${prefix}${entry.name}`);
  }
  return result.sort();
}
assert.deepEqual(await files(root), expected);
const html = await readFile(new URL('index.html', root), 'utf8');
assert.ok(html.includes("connect-src 'none'"));
assert.ok(html.includes('src="./assets/app.js"'));
assert.ok(!/<script\b[^>]*src=["']https?:/i.test(html));
assert.ok(!/\son[a-z]+\s*=/i.test(html));
const bundle = await readFile(new URL('assets/app.js', root), 'utf8');
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|eval)\s*\(/.test(bundle));
assert.ok(!/\.innerHTML\s*=/.test(bundle));
assert.ok((await readFile(new URL('assets/fflate.LICENSE', root), 'utf8')).includes('Permission is hereby granted'));
const info = JSON.parse(await readFile(new URL('build-info.json', root), 'utf8'));
for (const [name, hash] of Object.entries(info.sha256)) assert.equal(createHash('sha256').update(await readFile(new URL(`../${name}`, import.meta.url))).digest('hex'), hash);
console.log('Static release: exact public-file allowlist, source fingerprints, bundled dependencies, CSP, text-only output and fflate license verified.');
