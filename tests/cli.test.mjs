import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { encodeState, extractCode } from '../dist/index.js';

const CODE = 'flowchart LR\r\n  A[开始]-->B[Export ✨]\r\n';
const run = (args, input) => spawnSync(process.execPath, ['dist/cli.js', ...args], { input, encoding: 'utf8' });

test('CLI round-trips stdin exactly, with diagnostics separated from stdout', () => {
  const encoded = run(['encode'], CODE);
  assert.equal(encoded.status, 0, encoded.stderr);
  assert.equal(encoded.stderr, '');
  assert.ok(encoded.stdout.startsWith('https://mermaid.live/edit#pako:'));
  const decoded = run(['decode'], encoded.stdout);
  assert.equal(decoded.status, 0, decoded.stderr);
  assert.equal(decoded.stdout, CODE);
});

test('CLI file input, custom target, token and JSON output work', async () => {
  await mkdir('.artifacts', { recursive: true });
  await writeFile('.artifacts/source.mmd', CODE);
  const token = run(['encode', '.artifacts/source.mmd', '--token']);
  assert.equal(token.status, 0, token.stderr);
  assert.equal(extractCode(token.stdout).value, CODE);
  await writeFile('.artifacts/link.txt', token.stdout);
  const json = run(['decode', '--file', '.artifacts/link.txt', '--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).code, CODE);
  const custom = run(['encode', '--base-url', 'https://mermaidonline.org/'], CODE);
  assert.equal(custom.status, 0, custom.stderr);
  assert.ok(custom.stdout.startsWith('https://mermaidonline.org/#pako:'));
  assert.equal(run(['decode', encodeState({ code: CODE })]).stdout, CODE);
});

test('CLI errors, invalid UTF-8, missing files and oversized input have a nonzero status', () => {
  const cases = [
    [['decode', 'pako:invalid']], [['unknown']], [['encode', '--unknown']],
    [['encode', '.artifacts/not-found.mmd']], [['decode', '--file', 'x', 'y']],
    [['encode', '--token', '--base-url', 'https://a.test/'], CODE],
    [['encode', '--json'], CODE], [['decode', '--token'], 'bad'],
    [['encode'], Buffer.from([0xff])], [['encode'], 'x'.repeat(512_001)],
  ];
  for (const [args, input] of cases) {
    const result = run(args, input);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.length > 0);
  }
  assert.match(run(['--help']).stdout, /Usage:/);
  assert.equal(run(['--version']).stdout, '0.1.0\n');
});
