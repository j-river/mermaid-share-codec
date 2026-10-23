import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const out = new URL('.artifacts/hf-space/', root);
await mkdir(new URL('assets/', out), { recursive: true });
for (const [source, target] of [['space/index.html', 'index.html'], ['space/style.css', 'assets/style.css'], ['space/README.md', 'README.md'], ['LICENSE', 'LICENSE'], ['node_modules/fflate/LICENSE', 'assets/fflate.LICENSE']]) {
  await writeFile(new URL(target, out), await readFile(new URL(source, root)));
}
await build({ entryPoints: [fileURLToPath(new URL('space/app.ts', root))], outfile: fileURLToPath(new URL('assets/app.js', out)), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
const fingerprints = {};
for (const name of ['src/index.ts', 'space/index.html', 'space/style.css', 'space/app.ts', 'space/README.md', 'scripts/build-space.mjs']) {
  fingerprints[name] = createHash('sha256').update(await readFile(new URL(name, root))).digest('hex');
}
await writeFile(new URL('build-info.json', out), JSON.stringify({ library: 'mermaid-share-codec', version: '0.1.0', source: 'https://github.com/j-river/mermaid-share-codec', sha256: fingerprints }, null, 2) + '\n');
console.log('Static Mermaid Share Lab: .artifacts/hf-space/ (7 public files).');
