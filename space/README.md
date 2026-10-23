---
title: Mermaid Share Lab
emoji: 🔗
colorFrom: purple
colorTo: indigo
sdk: static
app_file: index.html
license: mit
short_description: Create Mermaid share links and recover source locally.
tags:
  - mermaid
  - typescript
  - developer-tools
  - diagrams
---

# Mermaid Share Lab

Create a Mermaid share link, recover source from an existing link, and inspect
the decoded JSON. Powered by the MIT-licensed
[mermaid-share-codec](https://github.com/j-river/mermaid-share-codec).

## Try it

1. Choose a synthetic Flowchart, Sequence or Unicode example, or paste source.
2. Select Mermaid Online or Mermaid Live Editor explicitly, plus theme data.
3. Create a link; the app checks that decoding recovers the exact source.
4. Use **Inspect this link** to recover source and inspect the full JSON.
5. Copy the source, download `diagram.mmd`, or use the recovered source as input.

This playground is a codec, **not a diagram renderer or syntax checker**. To
preview Mermaid and export images, open the generated link in your chosen
editor or visit [Mermaid Online](https://mermaidonline.org/).

## Format and limits

Writes `pako:` states; reads `pako:` and `base64:` states from a token, fragment,
or absolute HTTP(S) URL. Percent-encoded tokens, cloud IDs and site-specific
`#code=` links are outside this codec's scope. Pasted URLs are never fetched.
Compatibility with every editor or future editor version is not promised.

The UI accepts up to 100,000 source characters. The codec limits share tokens
to 100,000 characters, decoded JSON to 512,000 UTF-8 bytes and JSON container
depth to 32. Serialized overhead may make smaller source fail those limits.
Browser textareas normalize line endings; exact-match checks compare the
current input value. The library itself preserves the source it receives.
Other applications and destination editors may impose smaller URL limits.

## Privacy

The app encodes and decodes in browser memory. It has no upload endpoint,
analytics, remote runtime scripts, API key or persistent storage. The host may
log page requests. Opening external links loads the destination you choose.

Compression is not encryption. A share link contains source, cannot be revoked,
and can be read by people or scripts that obtain it. Opening an editor exposes
the fragment to that editor. Do not use share links as access control.

Recovered code and configuration are untrusted data. This app displays them as
text and never renders, executes or merges them into a renderer. **Use as input**
copies only the source, not arbitrary configuration or metadata.

## Reproduce

Clone the [source repository](https://github.com/j-river/mermaid-share-codec),
use Node.js 22+, run `npm ci --ignore-scripts`, `npm run check`, then
`npm run build:space` and `npm run test:space`. `npm run demo:space` starts the
local preview. Upload only the seven files in `.artifacts/hf-space/`, retaining
`assets/`, to a Static Space. The browser bundle includes fflate; its MIT license
is retained at `assets/fflate.LICENSE`.

This is an independent project, not an official Mermaid or Hugging Face product.
npm publication and production integration of the extracted package are pending.
