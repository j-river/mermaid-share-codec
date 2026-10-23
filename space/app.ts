import { createShareUrl, decodeState, extractCode, CodecError } from '../src/index.js';

const field = (id: string) => document.getElementById(id) as HTMLTextAreaElement;
const element = (id: string) => document.getElementById(id)!;
const source = field('source'), input = field('share-input');
const target = document.getElementById('target') as HTMLSelectElement;
const theme = document.getElementById('theme') as HTMLSelectElement;
const open = document.getElementById('open-editor') as HTMLAnchorElement;
const targets = new Set(['https://mermaidonline.org/', 'https://mermaid.live/edit']);
const themes = new Set(['default', 'dark', 'neutral']);
let encoded = '', recovered = '', encodeVersion = 0, decodeVersion = 0;
const examples: Record<string, string> = {
  flowchart: 'flowchart LR\n  draft[Write source] --> link[Create share link]\n  link --> reader[Recover source]\n  reader --> editor[Keep editing]\n',
  sequence: 'sequenceDiagram\n  participant Author\n  participant Reader\n  Author->>Reader: Share a source-bearing URL\n  Reader->>Reader: Decode the fragment locally\n  Reader-->>Author: Review the diagram source\n',
  unicode: 'flowchart LR\n  A["开始 ✨"] --> B["Partager un diagramme"]\n  B --> C["共有リンク"]\n  C --> D["Keep editing 🚀"]\n',
};

function status(id: string, message: string, error = false) {
  const node = element(id); node.textContent = message; node.dataset.error = String(error);
}
function errorText(error: unknown): string {
  return error instanceof CodecError ? `${error.code}: ${error.message}` : 'The operation could not be completed. Please check the input.';
}
function invalidateEncode(message = 'Source changed. Create a new link to continue.') {
  encodeVersion++; encoded = ''; field('share-url').value = '';
  element('encode-result').hidden = true; open.hidden = true; open.removeAttribute('href');
  status('encode-status', message);
}
function invalidateDecode(message = 'Input changed. Recover the source again to continue.') {
  decodeVersion++; recovered = ''; field('recovered-source').value = '';
  element('decoded-json').textContent = ''; element('decode-result').hidden = true;
  status('decode-status', message);
}
function encode() {
  invalidateEncode('Encoding locally…');
  try {
    if (source.value.length > 100_000) throw new CodecError('INPUT_TOO_LARGE', 'The source exceeds the playground limit.');
    if (!targets.has(target.value) || !themes.has(theme.value)) throw new CodecError('INVALID_STATE', 'Choose one of the listed destinations and themes.');
    const code = source.value;
    const url = createShareUrl({ code, mermaid: JSON.stringify({ theme: theme.value }) }, { baseUrl: target.value });
    const check = extractCode(url);
    if (!check.ok || check.value !== code) throw new Error('Round-trip failed.');
    encoded = url; field('share-url').value = url;
    element('source-bytes').textContent = `${new TextEncoder().encode(code).length.toLocaleString()} B`;
    element('url-chars').textContent = url.length.toLocaleString();
    element('roundtrip').textContent = 'Exact match ✓';
    element('length-note').textContent = url.length > 8000 ? 'This is a long URL. Messaging apps and destination editors may have smaller limits.' : 'Destination is explicit. No tracking parameters are added.';
    open.href = url; open.hidden = false; element('encode-result').hidden = false;
    status('encode-status', 'Link created locally. The recovered source matches the input exactly.');
  } catch (error) { status('encode-status', errorText(error), true); }
}
function decode() {
  invalidateDecode('Decoding locally…');
  const result = decodeState(input.value);
  if (!result.ok) { status('decode-status', errorText(result.error), true); return; }
  recovered = result.value.code; field('recovered-source').value = recovered;
  element('decoded-json').textContent = JSON.stringify(result.value, null, 2);
  element('decode-result').hidden = false;
  status('decode-status', 'Source recovered. Configuration and extension fields remain data, not renderer settings.');
}
async function copy(text: string, id: string, version: number, current: () => number) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (current() === version) status(id, 'Copied to clipboard.');
  } catch {
    if (current() === version) status(id, 'Clipboard is unavailable here. Select the result text and copy it manually.', true);
  }
}
source.addEventListener('input', () => {
  invalidateEncode();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) button.setAttribute('aria-pressed', 'false');
});
target.addEventListener('change', () => invalidateEncode('Destination changed. Create a new link.'));
theme.addEventListener('change', () => invalidateEncode('Theme data changed. Create a new link.'));
input.addEventListener('input', () => invalidateDecode());
element('encode').addEventListener('click', encode);
element('decode').addEventListener('click', decode);
element('try-link').addEventListener('click', () => { if (encoded) { input.value = encoded; decode(); } });
element('copy-url').addEventListener('click', () => { void copy(encoded, 'encode-status', encodeVersion, () => encodeVersion); });
element('copy-source').addEventListener('click', () => { void copy(recovered, 'decode-status', decodeVersion, () => decodeVersion); });
element('use-source').addEventListener('click', () => {
  if (!recovered) return;
  source.value = recovered; invalidateEncode('Recovered source copied to input. Extra JSON fields were not applied.');
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) button.setAttribute('aria-pressed', 'false');
  source.focus();
});
element('download-source').addEventListener('click', () => {
  if (!recovered) return;
  const url = URL.createObjectURL(new Blob([recovered], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'diagram.mmd';
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('decode-status', 'Source download requested. The file contains the recovered diagram source.');
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) {
  button.addEventListener('click', () => {
    const code = examples[button.dataset.sample!]; if (!code) return;
    source.value = code;
    for (const other of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) other.setAttribute('aria-pressed', String(other === button));
    encode();
  });
}
source.value = examples.flowchart!;
encode();
