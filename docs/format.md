# Wire format and compatibility scope

Reference serde: mermaid-js/mermaid-live-editor at
[`eb4141dd51247259e95ecd890c1bf3dabf314913`](https://github.com/mermaid-js/mermaid-live-editor/blob/eb4141dd51247259e95ecd890c1bf3dabf314913/src/lib/util/serde.ts).

The UI fixture was captured from the real editor's Full Screen href on
2026-10-22, with renderer version 12.2.0 visible in the UI. That renderer
version does not identify the exact deployed editor commit. The reference
source and live fixture are separate compatibility evidence.

## State

```json
{
  "code": "flowchart LR\n  A-->B",
  "mermaid": "{\"theme\":\"default\"}",
  "updateDiagram": true,
  "rough": false
}
```

Additional JSON properties are preserved. The official editor may ignore
unknown properties. Do not assume another editor understands your extensions.

## Encoding

1. Serialize JSON with UTF-8.
2. Compress with zlib-wrapped DEFLATE (default level 9 here).
3. Base64URL-encode with no padding and prepend `pako:`.
4. Put the token after `#` in the chosen editor URL.

`base64:` contains Base64-encoded UTF-8 JSON without compression. Both padded
and unpadded encodings, with either URL-safe or standard alphabet, are read.
Unused nonzero bits, whitespace inside Base64 and bad padding are rejected.
The decoder accepts only explicit pako:/base64: prefixes. The official editor
also has legacy bare Base64 support; that behavior is intentionally not inferred.

zlib preset dictionaries are not supported. Adler-32 is checked separately
because fflate's decompression functions do not validate that checksum.

## Independent tests

Tests build the official serde module with its own pako/js-base64 dependencies
and exchange states in both directions. They also decode the fixed UI fixture
and compare with independent pako decoding. Source bytes, config strings and
metadata are compared; compressor byte identity is not required.

The library does not render Mermaid source. Source syntax versions and each
editor's supported configuration or UI settings are outside this protocol test.
