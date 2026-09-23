/**
 * Serves the generated Explorer, using only Node.
 *
 * The output is static, so looking at it should not require the Go toolchain.
 * This exists for that, and for the common case of a terminal opened before Go
 * was installed, which cannot see it on PATH yet.
 *
 * Headers are read from the generated vercel.json rather than restated here.
 * That keeps one source of truth: whatever the host will send, this sends, and
 * a policy cannot be strict in review and loose in production by drifting
 * between two copies.
 *
 * Run: node tools/serve.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const DIR = resolve('dist/explorer');
const PORT = Number(process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Reads the headers the host will send, so local review matches production. */
async function hostHeaders() {
  try {
    const config = JSON.parse(await readFile(join(DIR, 'vercel.json'), 'utf8'));
    const global = (config.headers || []).find(r => r.source === '/(.*)');
    return Object.fromEntries((global?.headers || []).map(h => [h.key, h.value]));
  } catch {
    console.error('warning: no vercel.json found, serving without security headers');
    console.error('         run: go run ./tools/explorer');
    return {};
  }
}

const headers = await hostHeaders();

try {
  await stat(join(DIR, 'index.html'));
} catch {
  console.error(`nothing to serve at ${DIR}`);
  console.error('generate it first:  go run ./tools/explorer');
  process.exit(1);
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') path = '/index.html';
  // A bare name resolves to its page, matching cleanUrls on the host.
  if (!extname(path)) path += '.html';

  // Never serve outside the output directory, whatever the request says.
  const file = resolve(join(DIR, path));
  if (!file.startsWith(DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      ...headers,
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
    console.log(`  200  ${path}`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    console.log(`  404  ${path}`);
  }
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nserving ${DIR}\n`);
  console.log(`  ${url}/             the argument, and what is built`);
  console.log(`  ${url}/instruments  what each fixture actually is`);
  console.log(`  ${url}/evidence     the full survey`);
  console.log(`  ${url}/verify       check a hallmark in your own browser`);
  console.log(`\nheaders: ${Object.keys(headers).join(', ') || 'none'}`);
  console.log('ctrl+c to stop\n');
});
