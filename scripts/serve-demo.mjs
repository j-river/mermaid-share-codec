import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const allowed = ['/examples/browser/', '/dist/', '/tests/fixtures/', '/tests/browser.html'];
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const target = pathname === '/' ? '/examples/browser/index.html' : pathname;
  if (!allowed.some(prefix => target.startsWith(prefix)) || target.includes('..') || target.includes('%')) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const data = await readFile(path.join(root, target));
    res.writeHead(200, { 'Content-Type': `${types[path.extname(target)] ?? 'text/plain'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4178, '127.0.0.1', () => console.log('Demo: http://127.0.0.1:4178/ | Browser tests: http://127.0.0.1:4178/tests/browser.html'));
