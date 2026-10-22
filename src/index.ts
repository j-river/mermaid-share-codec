import { Inflate, zlibSync } from 'fflate';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Config and extension fields are data, never trusted renderer options. */
export interface ShareState {
  code: string;
  mermaid?: string;
  [key: string]: JsonValue | undefined;
}

export interface CodecLimits {
  /** Maximum token characters, including pako:/base64:. May only lower the default. */
  maxInputLength?: number;
  /** Maximum uncompressed UTF-8 JSON bytes. May only lower the default. */
  maxDecodedBytes?: number;
  /** Maximum JSON container depth, with the root object at depth 1. */
  maxDepth?: number;
}

export const DEFAULT_LIMITS: Readonly<Required<CodecLimits>> = Object.freeze({
  maxInputLength: 100_000,
  maxDecodedBytes: 512_000,
  maxDepth: 32,
});

export type CodecErrorCode =
  | 'INVALID_LIMITS' | 'INVALID_URL' | 'UNSUPPORTED_FORMAT' | 'INVALID_BASE64'
  | 'DECOMPRESSION_FAILED' | 'INVALID_JSON' | 'INVALID_STATE'
  | 'INPUT_TOO_LARGE' | 'OUTPUT_TOO_LARGE';

export class CodecError extends Error {
  readonly code: CodecErrorCode;
  constructor(code: CodecErrorCode, message: string) {
    super(message);
    this.name = 'CodecError';
    this.code = code;
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CodecError };
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function fail(code: CodecErrorCode, message: string): never {
  throw new CodecError(code, message);
}

function limitsFor(input: CodecLimits = {}): typeof DEFAULT_LIMITS {
  if (!input || typeof input !== 'object') fail('INVALID_LIMITS', 'Limits must be an object.');
  const resolved = { ...DEFAULT_LIMITS };
  for (const key of ['maxInputLength', 'maxDecodedBytes', 'maxDepth'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) {
      fail('INVALID_LIMITS', `${key} must be a positive integer no greater than ${DEFAULT_LIMITS[key]}.`);
    }
    resolved[key] = value;
  }
  return resolved;
}

function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    parts.push(alphabet[a >>> 2]!, alphabet[((a & 3) << 4) | ((b ?? 0) >>> 4)]!);
    if (b !== undefined) parts.push(alphabet[((b & 15) << 2) | ((c ?? 0) >>> 6)]!);
    if (c !== undefined) parts.push(alphabet[c & 63]!);
  }
  return parts.join('');
}

function fromBase64(value: string): Uint8Array {
  // Accept padded/unpadded URL-safe or standard Base64, without whitespace.
  if (!value || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(value)) {
    fail('INVALID_BASE64', 'The payload is not valid Base64.');
  }
  const raw = value.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const remainder = raw.length % 4;
  if (remainder === 1 || (value.includes('=') && value.length % 4 !== 0)) {
    fail('INVALID_BASE64', 'The Base64 length or padding is invalid.');
  }
  const bytes = new Uint8Array(Math.floor(raw.length * 6 / 8));
  let bits = 0, bitCount = 0, offset = 0;
  for (const char of raw) {
    bits = (bits << 6) | alphabet.indexOf(char);
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[offset++] = (bits >>> bitCount) & 255;
    }
  }
  // Reject non-zero unused bits and excess padding; avoid ambiguous encodings.
  if (toBase64(bytes) !== raw || (value.includes('=') && value.length - raw.length !== (4 - remainder) % 4)) {
    fail('INVALID_BASE64', 'The Base64 encoding is not canonical.');
  }
  return bytes;
}

function tokenFrom(input: string, maxLength: number): string {
  if (typeof input !== 'string') fail('UNSUPPORTED_FORMAT', 'Expected a token, fragment, or HTTP(S) URL.');
  // Allow a small URL envelope, but reject huge strings before parsing or copying.
  if (input.length > maxLength + 4097) fail('INPUT_TOO_LARGE', 'The share input is too long.');
  let token = input.trim();
  if (/^https?:\/\//i.test(token)) {
    let url: URL;
    try { url = new URL(token); } catch { return fail('INVALID_URL', 'Invalid share URL.'); }
    if (url.username || url.password) fail('INVALID_URL', 'URLs with credentials are not accepted.');
    if (url.origin.length + url.pathname.length + url.search.length > 4096) fail('INVALID_URL', 'The URL envelope is too long.');
    token = url.hash.slice(1);
  } else if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(token) || /^(?:javascript|data|file):/i.test(token)) {
    fail('INVALID_URL', 'Only HTTP(S) share URLs are accepted.');
  } else if (token.startsWith('#')) {
    token = token.slice(1);
  }
  if (token.length > maxLength) fail('INPUT_TOO_LARGE', 'The share token is too long.');
  if (!token.startsWith('pako:') && !token.startsWith('base64:')) {
    fail('UNSUPPORTED_FORMAT', 'Expected a pako: or base64: fragment.');
  }
  return token;
}

function inflateBounded(bytes: Uint8Array, maximum: number): Uint8Array {
  // fflate does not verify zlib's Adler-32 checksum. Validate the wrapper here.
  if (bytes.length < 8 || (bytes[0]! & 15) !== 8 || (bytes[0]! >>> 4) > 7 ||
      ((bytes[0]! << 8) | bytes[1]!) % 31 !== 0 || (bytes[1]! & 32) !== 0) {
    fail('DECOMPRESSION_FAILED', 'Invalid or unsupported zlib header.');
  }
  const chunks: Uint8Array[] = [];
  let size = 0, adlerA = 1, adlerB = 0;
  const stream = new Inflate((chunk) => {
    size += chunk.length;
    if (size > maximum) fail('OUTPUT_TOO_LARGE', 'Uncompressed share data exceeds the limit.');
    for (const byte of chunk) {
      adlerA = (adlerA + byte) % 65521;
      adlerB = (adlerB + adlerA) % 65521;
    }
    chunks.push(chunk);
  });
  const end = bytes.length - 4;
  try {
    // Small compressed chunks bound expansion between size checks. Retained
    // output is capped; never decompress an entire hostile payload first.
    for (let offset = 2; offset < end; offset += 64) {
      const next = Math.min(offset + 64, end);
      stream.push(bytes.subarray(offset, next), next === end);
    }
  } catch (error) {
    if (error instanceof CodecError) throw error;
    return fail('DECOMPRESSION_FAILED', 'The compressed share data is damaged or truncated.');
  }
  const checksum = new DataView(bytes.buffer, bytes.byteOffset + end, 4).getUint32(0);
  if (checksum !== (((adlerB << 16) | adlerA) >>> 0)) {
    fail('DECOMPRESSION_FAILED', 'The zlib checksum does not match.');
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function validateJson(value: unknown, limits: typeof DEFAULT_LIMITS): asserts value is ShareState {
  const seen = new Set<object>();
  let approximateBytes = 0;
  const add = (bytes: number) => {
    approximateBytes += bytes;
    if (approximateBytes > limits.maxDecodedBytes) fail('OUTPUT_TOO_LARGE', 'The JSON state exceeds the output limit.');
  };
  const visit = (current: unknown, depth: number, countBytes = true): void => {
    if (current === null || typeof current === 'boolean') { if (countBytes) add(4); return; }
    if (typeof current === 'number' && Number.isFinite(current)) { if (countBytes) add(1); return; }
    if (typeof current === 'string') {
      if (current.length > limits.maxDecodedBytes) fail('OUTPUT_TOO_LARGE', 'A state string exceeds the limit.');
      // JSON.stringify escapes lone surrogates, so their value round-trips safely.
      if (countBytes) add(encoder.encode(current).length);
      return;
    }
    if (typeof current !== 'object' || depth > limits.maxDepth) fail('INVALID_STATE', 'Expected finite JSON data within the depth limit.');
    const proto = Object.getPrototypeOf(current);
    if ((Array.isArray(current) && proto !== Array.prototype) ||
        (!Array.isArray(current) && proto !== Object.prototype && proto !== null)) {
      fail('INVALID_STATE', 'State objects must be plain JSON objects.');
    }
    if (seen.has(current)) fail('INVALID_STATE', 'Circular state data is not supported.');
    if (Object.getOwnPropertySymbols(current).length) fail('INVALID_STATE', 'Symbol properties are not JSON data.');
    seen.add(current);
    if (countBytes) add(2);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
      if (Array.isArray(current) && key === 'length') continue;
      if (!descriptor.enumerable) fail('INVALID_STATE', 'State properties must be enumerable JSON data.');
      if (!('value' in descriptor)) fail('INVALID_STATE', 'State getters and setters are not supported.');
      if (Array.isArray(current) && !/^(?:0|[1-9]\d*)$/.test(key)) fail('INVALID_STATE', 'Arrays cannot have named properties.');
      if (countBytes && !Array.isArray(current)) add(encoder.encode(key).length);
      visit(descriptor.value, depth + 1, countBytes);
    }
    if (Array.isArray(current) && Object.keys(current).length !== current.length) fail('INVALID_STATE', 'Sparse arrays are not supported.');
    seen.delete(current);
  };
  visit(value, 1);
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_STATE', 'The share state must be an object.');
  const state = value as Record<string, unknown>;
  if (typeof state.code !== 'string' || !state.code.trim()) fail('INVALID_STATE', 'The state needs a non-empty code string.');
  if (state.mermaid !== undefined && typeof state.mermaid !== 'string') fail('INVALID_STATE', 'mermaid must be a JSON configuration string.');
  if (typeof state.mermaid === 'string') {
    let config: unknown;
    try { config = JSON.parse(state.mermaid); } catch { return fail('INVALID_STATE', 'mermaid must contain valid JSON.'); }
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail('INVALID_STATE', 'mermaid configuration must describe an object.');
    // Validate embedded JSON too. Do not recursively treat it as another state.
    visit(config, 1, false);
  }
}

/** Throws CodecError for invalid state or limits. Does not render or upload. */
export function encodeState(state: ShareState, options: CodecLimits = {}): string {
  const limits = limitsFor(options);
  validateJson(state, limits);
  // Current official state expects mermaid as a string. Keep unknown JSON
  // fields intact for interoperability, without executing or merging them.
  const normalized = { mermaid: '{"theme":"default"}', updateDiagram: true, rough: false, ...state };
  const bytes = encoder.encode(JSON.stringify(normalized));
  if (bytes.length > limits.maxDecodedBytes) fail('OUTPUT_TOO_LARGE', 'The serialized JSON exceeds the output limit.');
  const token = `pako:${toBase64(zlibSync(bytes, { level: 9 }))}`;
  if (token.length > limits.maxInputLength) fail('INPUT_TOO_LARGE', 'The encoded token exceeds the input limit.');
  return token;
}

/** Returns structured failures for untrusted user input; never fetches a URL. */
export function decodeState(input: string, options: CodecLimits = {}): Result<ShareState> {
  try {
    const limits = limitsFor(options);
    const token = tokenFrom(input, limits.maxInputLength);
    const separator = token.indexOf(':');
    const encoded = fromBase64(token.slice(separator + 1));
    let bytes: Uint8Array;
    if (token.startsWith('pako:')) bytes = inflateBounded(encoded, limits.maxDecodedBytes);
    else {
      if (encoded.length > limits.maxDecodedBytes) fail('OUTPUT_TOO_LARGE', 'Decoded share data exceeds the limit.');
      bytes = encoded;
    }
    let state: unknown;
    try { state = JSON.parse(decoder.decode(bytes)); }
    catch { return fail('INVALID_JSON', 'The share data is not valid UTF-8 JSON.'); }
    validateJson(state, limits);
    return { ok: true, value: state };
  } catch (error) {
    if (error instanceof CodecError) return { ok: false, error };
    return { ok: false, error: new CodecError('INVALID_STATE', 'The share state could not be read.') };
  }
}

export interface ShareUrlOptions extends CodecLimits { baseUrl: string }

/** The target is explicit. No promotion parameters are added to the URL. */
export function createShareUrl(state: ShareState, options: ShareUrlOptions): string {
  let url: URL;
  try { url = new URL(options.baseUrl); } catch { return fail('INVALID_URL', 'baseUrl must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    fail('INVALID_URL', 'baseUrl must be HTTP(S), without credentials or an existing fragment.');
  }
  if (url.href.length > 4096) fail('INVALID_URL', 'baseUrl exceeds the URL envelope limit.');
  url.hash = encodeState(state, options);
  return url.href;
}

/** Source-only convenience API. Returned Mermaid source is still untrusted. */
export function extractCode(input: string, options: CodecLimits = {}): Result<string> {
  const result = decodeState(input, options);
  return result.ok ? { ok: true, value: result.value.code } : result;
}
