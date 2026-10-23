import http from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../.artifacts/hf-space/', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/assets/app.js', ['assets/app.js', 'text/javascript']], ['/assets/style.css', ['assets/style.css', 'text/css']],
  ['/assets/fflate.LICENSE', ['assets/fflate.LICENSE', 'text/plain']], ['/README.md', ['README.md', 'text/plain']],
  ['/LICENSE', ['LICENSE', 'text/plain']], ['/build-info.json', ['build-info.json', 'application/json']],
]);
http.createServer(async (req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const bytes = await readFile(new URL(file[0], root));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
  } catch { res.writeHead(404); res.end('Build the Space first.'); }
}).listen(4182, '127.0.0.1', () => console.log('Mermaid Share Lab: http://127.0.0.1:4182/'));
