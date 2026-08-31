/* Tiny local dev server mimicking `vercel dev`.
   Serves /public statically and dispatches /api/{name}(?...) to /api/{name}.js.
   Uses only Node built-ins so no extra deps are required. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const API_DIR = path.join(ROOT, 'api');

// Manually load .env.local into process.env
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8');
  envText.split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  });
} catch (e) {
  console.warn('No .env.local found — that is fine if envs are set some other way.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js':  'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(buf);
  });
}

function makeVercelReq(rawReq, parsed) {
  rawReq.query = Object.fromEntries(Object.entries(parsed.query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return rawReq;
}

function makeVercelRes(rawRes) {
  rawRes.status = (code) => { rawRes.statusCode = code; return rawRes; };
  rawRes.json = (obj) => {
    rawRes.setHeader('Content-Type', 'application/json; charset=utf-8');
    rawRes.end(JSON.stringify(obj));
    return rawRes;
  };
  return rawRes;
}

async function handleApi(name, req, res) {
  const file = path.join(API_DIR, `${name}.js`);
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: `Unknown endpoint: ${name}` });
    return;
  }
  delete require.cache[require.resolve(file)];
  const handler = require(file);
  try {
    await handler(req, res);
  } catch (err) {
    console.error(`api/${name} error:`, err);
    if (!res.writableEnded) res.status(500).json({ error: err.message });
  }
}

const server = http.createServer(async (rawReq, rawRes) => {
  const parsed = url.parse(rawReq.url, true);
  const pathname = parsed.pathname || '/';
  const res = makeVercelRes(rawRes);

  // API
  if (pathname.startsWith('/api/')) {
    const req = makeVercelReq(rawReq, parsed);
    const name = pathname.slice('/api/'.length).replace(/\/+$/, '').replace(/\.js$/, '');
    return handleApi(name, req, res);
  }

  // Static
  let filePath;
  if (pathname === '/' || pathname === '') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else {
    filePath = path.join(PUBLIC_DIR, pathname);
  }
  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    serveStatic(res, filePath);
  });
});

server.listen(PORT, () => {
  console.log(`AQI Typing Adventure dev server → http://localhost:${PORT}`);
  console.log(`MOCK_MODE=${process.env.MOCK_MODE || '(unset)'}`);
});
