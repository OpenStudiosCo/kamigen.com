#!/usr/bin/env node
/**
 * Kamigen Comics Editor — localhost authoring service.
 * Reads/writes only under allowed project directories. Not used by the deployed site.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.KCE_HOST || '127.0.0.1';
const PORT = Number(process.env.KCE_PORT || 9977);

const ALLOWED_READ_PREFIXES = [
  path.join(ROOT, 'art'),
  path.join(ROOT, 'new', 'src', 'assets'),
  path.join(ROOT, 'assets'),
  path.join(ROOT, 'comics-editor'),
  path.join(ROOT, 'src', 'comics-editor'),
  path.join(ROOT, 'docs', 'comics-editor')
];

const ALLOWED_WRITE_DIRS = [
  path.join(ROOT, 'art', 'comics', 'compositions'),
  path.join(ROOT, 'art', 'comics', 'library'),
  path.join(ROOT, 'art', 'comics', 'exports'),
  path.join(ROOT, 'art', 'comics', 'library', 'imports'),
  path.join(ROOT, 'art', 'comics', 'library', 'placeholders'),
  path.join(ROOT, '.comics-editor-autosave'),
  path.join(ROOT, '.comics-editor-preview')
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

function ensureDirs() {
  ALLOWED_WRITE_DIRS.forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function resolveSafe(relPath, { forWrite = false } = {}) {
  if (!relPath || typeof relPath !== 'string') throw new Error('Path required');
  const normalised = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalised.includes('\0') || normalised.split('/').includes('..')) {
    throw new Error('Invalid path');
  }
  const absolute = path.resolve(ROOT, normalised);
  if (!absolute.startsWith(ROOT + path.sep) && absolute !== ROOT) {
    throw new Error('Path escapes project root');
  }
  if (forWrite) {
    const ok = ALLOWED_WRITE_DIRS.some((dir) => absolute === dir || absolute.startsWith(dir + path.sep));
    if (!ok) throw new Error(`Write not allowed: ${normalised}`);
  } else {
    const ok = ALLOWED_READ_PREFIXES.some((dir) => absolute === dir || absolute.startsWith(dir + path.sep))
      || absolute === path.join(ROOT, 'comics-editor', 'index.html')
      || normalised === 'comics-editor/index.html';
    // Allow reading any file under ROOT for editor preview of existing art (still no write).
    if (!ok && !absolute.startsWith(ROOT + path.sep)) throw new Error('Read not allowed');
  }
  return { absolute, relative: path.relative(ROOT, absolute).split(path.sep).join('/') };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 40 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/comics-editor/index.html';
  if (rel.endsWith('/')) rel = `${rel}index.html`;
  if (rel.startsWith('/')) rel = rel.slice(1);
  let absolute;
  try {
    absolute = resolveSafe(rel).absolute;
  } catch (error) {
    res.writeHead(403);
    res.end(error.message);
    return;
  }
  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
    absolute = path.join(absolute, 'index.html');
  }
  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(absolute).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(absolute).pipe(res);
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api/, '') || '/';

  if (req.method === 'GET' && route === '/health') {
    return sendJson(res, 200, { ok: true, root: ROOT, host: HOST, port: PORT });
  }

  if (req.method === 'GET' && route === '/compositions') {
    const dir = path.join(ROOT, 'art', 'comics', 'compositions');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    return sendJson(res, 200, { compositions: files.map((f) => ({ file: f, path: `art/comics/compositions/${f}` })) });
  }

  if (req.method === 'GET' && route === '/composition') {
    const rel = url.searchParams.get('path');
    const { absolute, relative } = resolveSafe(rel);
    if (!absolute.endsWith('.json')) throw new Error('Only JSON compositions');
    const text = fs.readFileSync(absolute, 'utf8');
    return sendJson(res, 200, { path: relative, text });
  }

  if (req.method === 'GET' && route === '/assets') {
    const catalogPath = path.join(ROOT, 'art', 'comics', 'library', 'assets.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return sendJson(res, 200, catalog);
  }

  if (req.method === 'PUT' && route === '/composition') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const { absolute, relative } = resolveSafe(body.path, { forWrite: true });
    if (!absolute.endsWith('.json')) throw new Error('Only JSON compositions');
    if (typeof body.text !== 'string') throw new Error('text required');
    // Light validation
    const parsed = JSON.parse(body.text);
    if (parsed.format !== 'kamigen-comic-composition') throw new Error('Invalid composition format');
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, body.text.endsWith('\n') ? body.text : `${body.text}\n`, 'utf8');
    return sendJson(res, 200, { ok: true, path: relative });
  }

  if (req.method === 'PUT' && route === '/autosave') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const name = (body.id || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
    const relative = `.comics-editor-autosave/${name}.json`;
    const { absolute } = resolveSafe(relative, { forWrite: true });
    fs.writeFileSync(absolute, body.text.endsWith('\n') ? body.text : `${body.text}\n`, 'utf8');
    return sendJson(res, 200, { ok: true, path: relative });
  }

  // Live editor preview: stores the in-memory (possibly unsaved) composition temporarily.
  if (req.method === 'PUT' && route === '/preview') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    if (typeof body.text !== 'string') throw new Error('text required');
    const parsed = JSON.parse(body.text);
    if (parsed.format !== 'kamigen-comic-composition') throw new Error('Invalid composition format');
    const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const relative = `.comics-editor-preview/${token}.json`;
    const { absolute } = resolveSafe(relative, { forWrite: true });
    const payload = {
      token,
      id: body.id || parsed.id || 'preview',
      sourcePath: body.sourcePath || '',
      dirty: !!body.dirty,
      created: new Date().toISOString(),
      text: body.text.endsWith('\n') ? body.text : `${body.text}\n`
    };
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(payload)}\n`, 'utf8');
    // Best-effort cleanup of old preview sessions (>2h)
    try {
      const dir = path.join(ROOT, '.comics-editor-preview');
      const now = Date.now();
      fs.readdirSync(dir).forEach((f) => {
        if (!f.endsWith('.json')) return;
        const full = path.join(dir, f);
        const age = now - fs.statSync(full).mtimeMs;
        if (age > 2 * 60 * 60 * 1000) fs.unlinkSync(full);
      });
    } catch (e) { /* ignore */ }
    return sendJson(res, 200, { ok: true, token, path: relative });
  }

  if (req.method === 'GET' && route === '/preview') {
    const token = (url.searchParams.get('token') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!token) throw new Error('token required');
    const relative = `.comics-editor-preview/${token}.json`;
    const { absolute } = resolveSafe(relative);
    if (!fs.existsSync(absolute)) throw new Error('Preview expired or not found — open Preview again from the editor');
    const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    return sendJson(res, 200, {
      token: payload.token,
      id: payload.id,
      sourcePath: payload.sourcePath,
      dirty: !!payload.dirty,
      created: payload.created,
      text: payload.text
    });
  }

  if (req.method === 'POST' && route === '/import') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const filename = path.basename(body.filename || 'import.bin').replace(/[^a-zA-Z0-9._ -]/g, '_');
    const category = (body.category || 'imports').replace(/[^a-zA-Z0-9_-]/g, '');
    const destRel = `art/comics/library/imports/${category}/${filename}`;
    const { absolute, relative } = resolveSafe(destRel, { forWrite: true });
    if (!body.dataBase64) throw new Error('dataBase64 required');
    const buffer = Buffer.from(body.dataBase64, 'base64');
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, buffer);

    const catalogPath = path.join(ROOT, 'art', 'comics', 'library', 'assets.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const id = `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const asset = {
      id,
      name: body.name || filename,
      src: relative,
      kind: ext || 'bin',
      category: body.category || 'imports',
      tags: body.tags || [body.category || 'imports', 'imported'],
      variantGroup: body.variantGroup || id,
      variantName: body.variantName || 'default',
      width: body.width || null,
      height: body.height || null
    };
    catalog.assets.push(asset);
    catalog.updated = new Date().toISOString();
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    return sendJson(res, 200, { ok: true, asset, catalogPath: 'art/comics/library/assets.json' });
  }

  if (req.method === 'PUT' && route === '/export-file') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const filename = path.basename(body.filename || 'export.png').replace(/[^a-zA-Z0-9._ -]/g, '_');
    const relative = `art/comics/exports/${filename}`;
    const { absolute } = resolveSafe(relative, { forWrite: true });
    const buffer = Buffer.from(body.dataBase64, 'base64');
    fs.writeFileSync(absolute, buffer);
    return sendJson(res, 200, { ok: true, path: relative });
  }

  if (req.method === 'GET' && route === '/exists') {
    const rel = url.searchParams.get('path');
    const { absolute, relative } = resolveSafe(rel);
    return sendJson(res, 200, { path: relative, exists: fs.existsSync(absolute) });
  }

  sendJson(res, 404, { error: 'Unknown API route' });
}

ensureDirs();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 400, { error: error.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Kamigen Comics Editor server`);
  console.log(`  Open http://${HOST}:${PORT}/comics-editor/`);
  console.log(`  API  http://${HOST}:${PORT}/api/health`);
  console.log(`  Root ${ROOT}`);
  console.log(`  Writes limited to compositions, library, exports, autosave.`);
});
