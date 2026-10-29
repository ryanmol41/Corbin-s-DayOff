import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'time-off.json');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const IDENTITY_HEADER = (process.env.IDENTITY_HEADER || 'x-team-member').toLowerCase();
const SEASON_START = '2026-11-01';
const SEASON_END = '2027-01-10';
const TEAM_MEMBERS = new Set([
  'Able', 'Andrew', 'Bill', 'Christian', 'Clint', 'Corbin', 'Dave', 'Derrick', 'Ethan', 'Jackson',
  'Jacob G', 'Jacob H', 'Jake', 'John', 'Jon', 'Josh B', 'Josh I', 'Kevin', 'Kyle', 'Preston',
  'Rob', 'Ryan', 'Seth', 'Shane', 'Sonny', 'Thatcher', 'Tom', 'Victoria', 'Zach',
]);

let writes = Promise.resolve();

async function readEntries() {
  try {
    const entries = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeSnapshot(entries) {
  await mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, DATA_FILE);
}

function transactEntries(transform) {
  const operation = writes.then(async () => {
    const entries = await readEntries();
    const { next, result } = await transform(entries);
    if (next) await writeSnapshot(next);
    return result;
  });
  writes = operation.then(() => undefined, () => undefined);
  return operation;
}

function getIdentity(request) {
  const raw = request.headers[IDENTITY_HEADER];
  const name = Array.isArray(raw) ? raw[0] : raw;
  return typeof name === 'string' && TEAM_MEMBERS.has(name) ? name : '';
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw Object.assign(new Error('Please check the form and try again.'), { status: 400 });
  }
}

function validateEntry(data) {
  const employee = typeof data.employee === 'string' ? data.employee.trim() : '';
  const cover = typeof data.cover === 'string' ? data.cover.trim() : '';
  const note = typeof data.note === 'string' ? data.note.trim().slice(0, 240) : '';
  const startDate = typeof data.startDate === 'string' ? data.startDate : '';
  const endDate = typeof data.endDate === 'string' ? data.endDate : '';
  if (!TEAM_MEMBERS.has(employee) || !TEAM_MEMBERS.has(cover) || !startDate || !endDate) {
    throw Object.assign(new Error('Add a team member, dates, and coverage person.'), { status: 400 });
  }
  if (startDate > endDate || startDate < SEASON_START || endDate > SEASON_END || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw Object.assign(new Error('Choose dates within November 1, 2026 and January 10, 2027.'), { status: 400 });
  }
  return { employee, startDate, endDate, cover, note };
}

async function handleApi(request, response, url) {
  const identity = getIdentity(request);
  if (request.method === 'GET' && url.pathname === '/api/time-off') {
    try {
      await writes;
      const entries = await readEntries();
      entries.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.employee.localeCompare(b.employee));
      return sendJson(response, 200, { entries, currentUserId: identity });
    } catch {
      return sendJson(response, 503, { error: 'The calendar data could not be read.' });
    }
  }

  if (!identity) return sendJson(response, 401, { error: 'Choose your name in the top bar first.' });

  if (request.method === 'POST' && url.pathname === '/api/time-off') {
    try {
      const details = validateEntry(await readJson(request));
      const entry = { id: randomUUID(), ...details, createdBy: identity, createdAt: new Date().toISOString() };
      await transactEntries((entries) => ({ next: [...entries, entry], result: entry }));
      return sendJson(response, 201, { entry });
    } catch (error) {
      return sendJson(response, error.status || 503, { error: error.status ? error.message : 'The calendar could not save that change. Please try again.' });
    }
  }

  if (request.method === 'PUT' && url.pathname === '/api/time-off') {
    try {
      const payload = await readJson(request);
      const id = typeof payload.id === 'string' ? payload.id : '';
      if (!id) return sendJson(response, 400, { error: 'Choose a request to update.' });
      const details = validateEntry(payload);
      const entry = await transactEntries((entries) => {
        const index = entries.findIndex((item) => item.id === id);
        if (index < 0 || entries[index].createdBy !== identity) return { next: null, result: null };
        entries[index] = { ...entries[index], ...details };
        return { next: entries, result: entries[index] };
      });
      if (!entry) return sendJson(response, 403, { error: 'Only the person who added this entry can edit it.' });
      return sendJson(response, 200, { entry });
    } catch (error) {
      return sendJson(response, error.status || 503, { error: error.status ? error.message : 'The calendar could not save that change. Please try again.' });
    }
  }

  if (request.method === 'DELETE' && url.pathname === '/api/time-off') {
    const id = url.searchParams.get('id');
    if (!id) return sendJson(response, 400, { error: 'Choose an entry to remove.' });
    try {
      const removed = await transactEntries((entries) => {
        const entry = entries.find((item) => item.id === id);
        if (!entry || entry.createdBy !== identity) return { next: null, result: false };
        return { next: entries.filter((item) => item.id !== id), result: true };
      });
      if (!removed) return sendJson(response, 403, { error: 'Only the person who added this entry can remove it.' });
      return sendJson(response, 200, { ok: true });
    } catch {
      return sendJson(response, 503, { error: 'The calendar could not save that change. Please try again.' });
    }
  }

  return sendJson(response, 404, { error: 'Not found.' });
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function handleStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST_DIR, relativePath);
  if (filePath !== DIST_DIR && !filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    let content;
    try {
      content = await readFile(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      filePath = path.join(DIST_DIR, 'index.html');
      content = await readFile(filePath);
    }
    response.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'cache-control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  } catch {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Build the app first with npm run build.');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  return handleStatic(request, response, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Holiday time off is listening on http://${HOST}:${PORT}`);
  console.log(`Calendar data: ${DATA_FILE}`);
  console.log(`Identity header: ${IDENTITY_HEADER}`);
});
