import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { encodeState, decodeState } from '../dist/index.js';

await mkdir('.artifacts', { recursive: true });
await build({ entryPoints: ['tests/upstream/serde.ts'], outfile: '.artifacts/official-serde.mjs', bundle: true, format: 'esm', platform: 'node' });
const official = await import('../.artifacts/official-serde.mjs');

test('interoperates in both directions with the pinned official serializeState/deserializeState', () => {
  for (const code of ['flowchart TD\n A[开始]-->B[✨]', 'sequenceDiagram\r\n Alice->>Bob: Hello\r\n']) {
    const state = { code, mermaid: '{"theme":"dark"}', updateDiagram: true, rough: false, panZoom: true, grid: true, zoom: 1.25 };
    assert.deepEqual(official.deserializeState(encodeState(state)), state);
    for (const format of ['pako', 'base64']) {
      const decoded = decodeState(official.serializeState(state, format));
      assert.equal(decoded.ok, true);
      assert.deepEqual(decoded.value, state);
    }
  }
});
