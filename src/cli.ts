import { createReadStream } from 'node:fs';
import { parseArgs } from 'node:util';
import { CodecError, createShareUrl, decodeState, encodeState } from './index.js';

const help = `mermaid-share 0.1.0

Usage:
  mermaid-share encode [file.mmd|-] [--base-url https://mermaid.live/edit] [--token]
  mermaid-share decode [url-or-token|-] [--file saved-link.txt] [--json]

With no input argument, read UTF-8 from stdin. encode emits a newline-terminated
URL (or --token); decode emits the original code exactly, or --json state.
No browser is opened, no network request is made, and no file is overwritten.

Options:
  --base-url URL  Explicit editor destination (default: https://mermaid.live/edit)
  --token         Emit only the pako: token when encoding
  --file PATH     Read a saved URL/token file when decoding
  --json          Emit the complete untrusted state when decoding
  --help          Show usage
  --version       Show version
`;

async function readInput(file: string | undefined): Promise<string> {
  const stream = file && file !== '-' ? createReadStream(file) : process.stdin;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of stream) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += bytes.length;
    if (size > 512_000) {
      stream.destroy();
      throw new CodecError('INPUT_TOO_LARGE', 'CLI input exceeds 512,000 bytes.');
    }
    chunks.push(bytes);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'base-url': { type: 'string' }, token: { type: 'boolean' },
      file: { type: 'string' }, json: { type: 'boolean' },
      help: { type: 'boolean' }, version: { type: 'boolean' },
    },
  });
  if (values.help) { process.stdout.write(help); return; }
  if (values.version) { process.stdout.write('0.1.0\n'); return; }
  const [command, argument, ...extra] = positionals;
  if (!['encode', 'decode'].includes(command ?? '') || extra.length) {
    throw new Error('Expected encode or decode and at most one input argument. Use --help.');
  }
  if (command === 'encode') {
    if (values.file || values.json) throw new Error('--file and --json apply only to decode.');
    if (values.token && values['base-url']) throw new Error('--token and --base-url cannot be combined.');
    const state = { code: await readInput(argument) };
    const output = values.token ? encodeState(state) : createShareUrl(state, { baseUrl: values['base-url'] ?? 'https://mermaid.live/edit' });
    process.stdout.write(`${output}\n`);
  } else {
    if (values.token || values['base-url']) throw new Error('--token and --base-url apply only to encode.');
    if (values.file && argument) throw new Error('Choose a URL argument or --file, not both.');
    const input = values.file ? await readInput(values.file)
      : argument && argument !== '-' ? argument : await readInput(undefined);
    const result = decodeState(input);
    if (!result.ok) throw result.error;
    process.stdout.write(values.json ? `${JSON.stringify(result.value, null, 2)}\n` : result.value.code);
  }
}

process.stdout.on('error', () => { process.exitCode = 1; });
main().catch((error: unknown) => {
  const code = error instanceof CodecError ? error.code : 'CLI_ERROR';
  const message = error instanceof Error ? error.message : 'Command failed.';
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
});
