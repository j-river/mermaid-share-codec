import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check with npm run test:package.');
const npm = (args, cwd = root) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
await mkdir('.artifacts', { recursive: true });
const [packed] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', '.artifacts']));
for (const file of packed.files) {
  assert.match(file.path, /^(?:dist\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/, `Unexpected public file: ${file.path}`);
  assert.ok(!/\.env|\.npmrc|integration-private|tests\/upstream/.test(file.path));
}
const installDir = await mkdtemp(path.join(root, '.artifacts', 'clean-install-'));
await writeFile(path.join(installDir, 'package.json'), '{"private":true,"type":"module"}\n');
npm(['install', path.join(root, '.artifacts', packed.filename), '--ignore-scripts', '--no-audit', '--no-fund'], installDir);
for (const [name, source] of [
  ['esm.mjs', `import assert from 'node:assert/strict'; import {encodeState,extractCode} from 'mermaid-share-codec'; assert.equal(extractCode(encodeState({code:'graph TD; A-->B'})).value,'graph TD; A-->B');`],
  ['commonjs.cjs', `const assert=require('node:assert/strict'); const codec=require('mermaid-share-codec'); assert.equal(codec.extractCode(codec.encodeState({code:'graph TD; A-->B'})).value,'graph TD; A-->B');`],
]) {
  const file = path.join(installDir, name);
  await writeFile(file, source);
  execFileSync(process.execPath, [file], { stdio: 'inherit', cwd: installDir });
}
const bin = path.join(installDir, 'node_modules', 'mermaid-share-codec', 'dist', 'cli.js');
const cli = spawnSync(process.execPath, [bin, 'encode', '--token'], { input: 'graph TD; A-->B', encoding: 'utf8', cwd: installDir });
assert.equal(cli.status, 0, cli.stderr);
assert.match(cli.stdout, /^pako:/);
const browser = await stat(path.join(installDir, 'node_modules', 'mermaid-share-codec', 'dist', 'browser.js'));
assert.ok(browser.size > 0);
const report = { node: process.version, tarball: packed.filename, integrity: packed.integrity, compressedBytes: packed.size, unpackedBytes: packed.unpackedSize, browserBytes: browser.size, files: packed.files.map(f => f.path), cleanInstall: true, esm: true, commonjs: true, cli: true };
await writeFile('.artifacts/package-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
