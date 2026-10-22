import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflate, inflate } from 'pako';
import { createRequire } from 'node:module';
import { CodecError, DEFAULT_LIMITS, encodeState, decodeState, createShareUrl, extractCode } from '../dist/index.js';

const CODE = 'flowchart LR\n  A[开始] --> B[Export ✨]\n';
const encodeForeign = (state) => `pako:${Buffer.from(deflate(JSON.stringify(state))).toString('base64url')}`;
const decode = (token, limits) => {
  const result = decodeState(token, limits);
  assert.equal(result.ok, true, result.ok ? '' : `${result.error.code}: ${result.error.message}`);
  return result.value;
};
const fails = (input, code, limits) => {
  const result = decodeState(input, limits);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
};

test('round-trips Unicode, whitespace, CRLF and JSON metadata without normalizing source', () => {
  for (const code of [CODE, '  graph TD; A-->B  ', 'graph TD\r\n A-->B\r\n', 'graph TD\n A[\ud800]-->B']) {
    const state = { code, mermaid: '{"theme":"dark"}', mmo: { theme: 'clean-docs', scale: '4' }, metadata: [null, true, 0] };
    const actual = decode(encodeState(state));
    for (const key of Object.keys(state)) assert.deepEqual(actual[key], state[key]);
  }
});

test('emits pako data independently readable with pako', () => {
  const token = encodeState({ code: CODE });
  assert.match(token, /^pako:[\w-]+$/);
  const state = JSON.parse(inflate(Buffer.from(token.slice(5), 'base64url'), { to: 'string' }));
  assert.equal(state.code, CODE);
  assert.equal(typeof state.mermaid, 'string');
  assert.deepEqual(JSON.parse(state.mermaid), { theme: 'default' });
});

test('reads pako, base64, prefixed fragments, full URLs, and padded standard Base64', () => {
  const state = { code: CODE, mermaid: '{"theme":"dark"}' };
  const pako = encodeForeign(state);
  const base64 = `base64:${Buffer.from(JSON.stringify(state)).toString('base64url')}`;
  for (const token of [pako, base64]) {
    for (const input of [token, `#${token}`, `https://mermaid.live/edit#${token}`, ` \n${token}\n `]) {
      assert.equal(decode(input).code, CODE);
    }
  }
  const padded = `pako:${Buffer.from(deflate(JSON.stringify(state))).toString('base64')}`;
  assert.equal(decode(padded).code, CODE);
});

test('reads the real official UI fixture, independently checked against pako', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/official-live.json', import.meta.url), 'utf8'));
  const token = new URL(fixture.url).hash.slice(6);
  const expected = JSON.parse(inflate(Buffer.from(token, 'base64url'), { to: 'string' }));
  const actual = decode(fixture.url);
  assert.equal(actual.code, expected.code);
  assert.match(actual.code, /Christmas/);
  assert.equal(actual.mermaid, expected.mermaid);
});

test('supports CommonJS consumers', () => {
  const cjs = createRequire(import.meta.url)('../dist/index.cjs');
  assert.equal(cjs.extractCode(cjs.encodeState({ code: CODE })).value, CODE);
});

test('explicit URL destination preserves query and path; source-only API works', () => {
  const url = createShareUrl({ code: CODE }, { baseUrl: 'https://mermaidonline.org/?existing=1' });
  assert.ok(url.startsWith('https://mermaidonline.org/?existing=1#pako:'));
  assert.equal(extractCode(url).value, CODE);
  assert.equal(extractCode('bad').ok, false);
  for (const baseUrl of ['javascript:alert(1)', '/edit', 'https://a.test/#old', 'https://me:secret@a.test', 'https://a.test/' + 'x'.repeat(4097)]) {
    assert.throws(() => createShareUrl({ code: CODE }, { baseUrl }), (e) => e.code === 'INVALID_URL');
  }
});

test('rejects unsupported formats and unsafe or malformed URLs without fetching', () => {
  for (const input of ['garbage', 'code=hello', 'cloud=x', 'e30', '#unknown:abc', 'https://a.test/?pako=abc']) fails(input, 'UNSUPPORTED_FORMAT');
  for (const input of ['https://', 'ftp://a.test/#pako:abc', 'javascript:alert(1)', 'https://u:p@a.test/#pako:abc']) fails(input, 'INVALID_URL');
  fails(null, 'UNSUPPORTED_FORMAT');
});

test('rejects malformed and ambiguous Base64 before inflation', () => {
  for (const body of ['', '!!!!', 'A', 'A===', 'Zg=', 'Zh==', 'e 30=', '=e30', 'e30===', 'AAAA=']) {
    fails(`pako:${body}`, 'INVALID_BASE64');
  }
});

test('checks zlib checksum, header, corruption and truncation', () => {
  const bytes = Buffer.from(deflate(JSON.stringify({ code: CODE })));
  const corruptChecksum = Buffer.from(bytes); corruptChecksum[corruptChecksum.length - 1] ^= 1;
  const corruptHeader = Buffer.from(bytes); corruptHeader[0] = 0;
  for (const bad of [Buffer.from('1234'), bytes.subarray(0, -1), bytes.subarray(0, 12), corruptChecksum, corruptHeader]) {
    fails(`pako:${bad.toString('base64url')}`, 'DECOMPRESSION_FAILED');
  }
});

test('checks JSON, UTF-8, code and config types', () => {
  for (const raw of ['not json', Buffer.from([0xff])]) {
    const token = `base64:${Buffer.from(raw).toString('base64url')}`;
    fails(token, 'INVALID_JSON');
  }
  for (const state of [null, [], 1, {}, { code: '' }, { code: '  ' }, { code: 5 }, { code: CODE, mermaid: {} }, { code: CODE, mermaid: '[]' }, { code: CODE, mermaid: 'broken' }]) {
    fails(encodeForeign(state), 'INVALID_STATE');
  }
});

test('retains external config as untrusted data and does not pollute prototypes', () => {
  const hostile = JSON.parse('{"code":"graph TD; A-->B", "__proto__":{"polluted":true}, "mermaid":"{\\"securityLevel\\":\\"loose\\"}"}');
  const actual = decode(encodeForeign(hostile));
  assert.equal(actual.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
  assert.equal(extractCode(encodeForeign(hostile)).value, hostile.code);
});

test('invalid limits become structured errors and encoding throws CodecError', () => {
  for (const options of [{ maxInputLength: 0 }, { maxDecodedBytes: Infinity }, { maxDepth: 33 }, null]) {
    fails(encodeState({ code: CODE }), 'INVALID_LIMITS', options);
    assert.throws(() => encodeState({ code: CODE }, options), CodecError);
  }
});

test('rejects cycles, getters, non-finite data, sparse arrays and custom objects', () => {
  const cycle = { code: CODE }; cycle.loop = cycle;
  const getter = { get code() { throw new Error('getter must not run'); } };
  class TransformingArray extends Array { toJSON() { throw new Error('must not execute'); } }
  for (const state of [cycle, getter, { code: CODE, meta: NaN }, { code: CODE, meta: new Date() }, { code: CODE, meta: Array(2) }, { code: CODE, meta: undefined }, { code: CODE, meta: new TransformingArray(1) }]) {
    assert.throws(() => encodeState(state), (e) => e instanceof CodecError && e.code === 'INVALID_STATE');
  }
});

test('input length boundary includes prefix and output boundary counts UTF-8 JSON bytes', () => {
  const token = encodeForeign({ code: CODE });
  assert.equal(decodeState(token, { maxInputLength: token.length }).ok, true);
  fails(token, 'INPUT_TOO_LARGE', { maxInputLength: token.length - 1 });
  const baseUrl = 'https://a.test/' + 'x'.repeat(4096 - 'https://a.test/'.length);
  const ownToken = encodeState({ code: CODE });
  const ownUrl = createShareUrl({ code: CODE }, { baseUrl, maxInputLength: ownToken.length });
  assert.equal(decode(ownUrl, { maxInputLength: ownToken.length }).code, CODE);
  const state = { code: CODE };
  const bytes = Buffer.byteLength(JSON.stringify(state));
  for (const mode of ['pako', 'base64']) {
    const input = mode === 'pako' ? encodeForeign(state) : `base64:${Buffer.from(JSON.stringify(state)).toString('base64url')}`;
    assert.equal(decodeState(input, { maxDecodedBytes: bytes }).ok, true);
    fails(input, 'OUTPUT_TOO_LARGE', { maxDecodedBytes: bytes - 1 });
  }
});

test('rejects a compressed bomb during streaming, and a valid JSON prefix followed by large whitespace', () => {
  for (const raw of [JSON.stringify({ code: 'x'.repeat(4_000_000) }), JSON.stringify({ code: CODE }) + ' '.repeat(4_000_000)]) {
    const token = `pako:${Buffer.from(deflate(raw)).toString('base64url')}`;
    assert.ok(token.length < DEFAULT_LIMITS.maxInputLength);
    fails(token, 'OUTPUT_TOO_LARGE');
  }
});

test('respects nesting and rejects huge source before writing an unusable token', () => {
  fails(encodeForeign({ code: CODE, meta: { nested: {} } }), 'INVALID_STATE', { maxDepth: 2 });
  assert.throws(() => encodeState({ code: 'x'.repeat(512_001) }), (e) => e.code === 'OUTPUT_TOO_LARGE');
  assert.throws(() => encodeState({ code: CODE }, { maxInputLength: 5 }), (e) => e.code === 'INPUT_TOO_LARGE');
});

test('every generated token respects its own supplied decode limits', () => {
  for (const code of [CODE, 'a'.repeat(40_000), 'graph TD; A-->B']) {
    const options = { maxDecodedBytes: 100_000, maxInputLength: 90_000 };
    const token = encodeState({ code }, options);
    assert.equal(decode(token, options).code, code);
  }
});

test('handles chunk boundaries, stored blocks and large JSON arrays with exact limits', () => {
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (const size of [1, 63, 64, 65, 127, 128, 129, 4096, 30_000]) {
    const code = Array.from({ length: size }, () => String.fromCharCode(33 + random() % 90)).join('');
    for (const level of [0, 1, 9]) {
      const token = `pako:${Buffer.from(deflate(JSON.stringify({code}), {level})).toString('base64url')}`;
      assert.equal(decode(token).code, code);
    }
  }
  const state = { code: CODE, entries: Array(10_000).fill(0) };
  const bytes = Buffer.byteLength(JSON.stringify(state));
  assert.deepEqual(decode(encodeForeign(state), { maxDecodedBytes: bytes }).entries, state.entries);
});
