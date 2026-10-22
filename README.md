# mermaid-share-codec

Encode and decode Mermaid Live Editor share links in browsers and Node.js.
Recover diagram source from a URL, or add sharing to your own tool without
loading Mermaid, React, or a rendering service.

**npm release candidate:** Registry publication is pending. After `npm install`
and `npm run check` in this source directory, use `npm pack` to create a local
installable tarball, or run the examples below. The registry installation
command becomes available after the first public release.

Need an editor rather than a library? [Mermaid Online](https://mermaidonline.org/)
lets you edit diagrams and export image files in your browser.

## Install and use

Node.js 22 or later; modern browsers with ES modules, TextEncoder and TextDecoder.

```sh
npm install mermaid-share-codec
```

```ts
import { createShareUrl, extractCode } from 'mermaid-share-codec';

const code = 'flowchart LR\n  A[Write] --> B[Share]\n';
const url = createShareUrl({ code }, { baseUrl: 'https://mermaid.live/edit' });
const result = extractCode(url);

if (result.ok) console.log(result.value); // The original source, unchanged.
else console.error(result.error.code, result.error.message);
```

Choose your destination explicitly, for example `https://mermaid.live/edit`
or `https://mermaidonline.org/`. No destination is substituted and no tracking
parameters are added. The library never opens or fetches a URL.

CommonJS is supported too:

```js
const { encodeState, decodeState } = require('mermaid-share-codec');
const token = encodeState({ code: 'graph TD; A-->B' });
const result = decodeState(token);
```

## API

| Function | Returns |
| --- | --- |
| `encodeState(state, limits?)` | A `pako:` token, without a leading `#`; throws `CodecError` on invalid input. |
| `decodeState(input, limits?)` | `{ ok: true, value: state }` or `{ ok: false, error: CodecError }`. |
| `createShareUrl(state, { baseUrl, ...limits })` | A full URL with the state in its fragment; throws on invalid input. |
| `extractCode(input, limits?)` | The same result shape as decodeState, containing only the source string. |

`decodeState` and `extractCode` accept a token, a `#fragment`, or an absolute
HTTP(S) URL. URLs with credentials, unsupported schemes, percent-encoded tokens,
bare legacy Base64 and site-specific `#code=...` / cloud IDs are not accepted.
Surrounding whitespace is ignored. `baseUrl` must have no existing fragment;
its path and query are preserved.

```ts
const state = {
  code: 'sequenceDiagram\n  Alice->>Bob: Hello',
  mermaid: JSON.stringify({ theme: 'dark' }),
  metadata: { source: 'my-editor' },
};
```

`code` must be a non-empty string. Its whitespace, CRLF, and Unicode are not
normalized. `mermaid`, when supplied, is a JSON **string** describing a config
object, matching the current official editor format. Config objects passed
directly as `mermaid` are rejected. Other finite JSON fields are preserved as
data; cycles, accessors, undefined values, custom objects and sparse arrays
are rejected. Missing config is encoded as `{"theme":"default"}`, and missing
`updateDiagram`/`rough` fields default to `true`/`false` respectively.

This package serializes data; it does not validate Mermaid diagram syntax.

### Limits and failures

Defaults: 100,000 token characters including the prefix, 512,000 uncompressed
UTF-8 JSON bytes, and 32 levels of JSON containers (root = 1). An HTTP(S) URL
may additionally have up to 4,096 characters of URL envelope. Custom limits
may only **lower** these ceilings. The same limits apply to encoding, so a
successfully encoded token can be read using the same limits.

```ts
const result = decodeState(untrustedLink, {
  maxInputLength: 20_000,
  maxDecodedBytes: 100_000,
  maxDepth: 16,
});
```

Stable error codes:
`INVALID_LIMITS`, `INVALID_URL`, `UNSUPPORTED_FORMAT`, `INVALID_BASE64`,
`DECOMPRESSION_FAILED`, `INVALID_JSON`, `INVALID_STATE`, `INPUT_TOO_LARGE`,
`OUTPUT_TOO_LARGE`. Callers should branch on codes rather than error messages.

Compressed data is decoded in small chunks with an output limit, a zlib header
check, and an Adler-32 integrity check. Limits reduce resource use; synchronous
decoding still uses CPU and is not a general-purpose isolation boundary.

## CLI

```sh
mermaid-share encode diagram.mmd
mermaid-share encode diagram.mmd --base-url https://mermaidonline.org/
mermaid-share encode diagram.mmd --token
mermaid-share decode "https://mermaid.live/edit#pako:..."
mermaid-share decode --file saved-link.txt --json
```

Run the locally built CLI with `node dist/cli.js --help`, or use `npx
mermaid-share-codec --help` after publication. Both commands accept stdin when
the input argument is omitted or `-`. Encode writes a URL/token plus newline;
decode writes the exact source, with no extra newline. `--json` exposes the
whole decoded state. Diagnostics go to stderr and failures exit nonzero.
Input is capped at 512,000 bytes. No files are overwritten.

## Browser example

```sh
npm install --ignore-scripts
npm run build
npm run demo
```

Open `http://127.0.0.1:4178/`. The example uses the self-contained
`dist/browser.js` ES module, which can also be copied into your application.
It includes fflate and its license notice; keep `dist/fflate.LICENSE` when
redistributing that bundle. Normal application imports can use their bundler
with the package's ESM entry and fflate dependency.

The example deliberately displays source as text instead of rendering it.
Browser checks are at `http://127.0.0.1:4178/tests/browser.html`.

## Compatibility and privacy

The `pako:` prefix is a format label, not a requirement to use the pako library.
The format is UTF-8 JSON → zlib DEFLATE → Base64URL. Different compressors may
produce different bytes that decode to the same state. This package writes
`pako:` and also reads `base64:`; it is independent of Mermaid JS and is not an
official Mermaid project.

Interoperability tests use a fixed official editor UI link and the official
serde implementation from a recorded commit. See [format notes](docs/format.md)
for the tested scope. Compatibility with mermaid.ink or every future editor
version is not claimed.

**A share link is not a secret.** The fragment is not normally included in an
HTTP request, but browser scripts, extensions and anyone with the link can
read it. Compression is not encryption; the link cannot be revoked. Opening
the chosen editor exposes the fragment to its scripts. Link length limits
vary across browsers, messaging apps and target editors.

Decoded source, `mermaid` config and metadata remain untrusted. Do not merge
arbitrary config into your renderer or apply CSS/security settings from a
link. Use your renderer's security controls. This library performs no XSS
sanitization and never executes config, downloads a loader, renders SVG,
contacts a server or sends telemetry.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
node examples/node/roundtrip.mjs
```

Tests cover independent official interoperability, malformed data, bounded
decompression, Unicode, CLI behavior, CJS/ESM and type resolution. The package
check installs the actual tarball in a clean temporary project and runs its
API and CLI. CI is configured for Node 22/24 on Linux and Windows; check the
actual CI run before interpreting a configured matrix as passing evidence.

Mermaid Online's existing share module is the integration target; deployment
of this extracted package is pending. Integration is not a claim that other
sites endorse this project.

## License

MIT. The browser bundle includes fflate's MIT-licensed implementation; its
license ships in `dist/fflate.LICENSE`. Official source used only as a test
oracle retains its upstream license and is excluded from the npm package.
