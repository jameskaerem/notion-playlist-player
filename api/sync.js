import { getSyncState, setSyncState, storageConfigured } from './_storage.js';

const TASK_ID = /^[a-zA-Z0-9-]{20,64}$/;
const MAX_BODY_BYTES = 64 * 1024;
const TASK_SECTIONS = new Set(['timer', 'soundtrack']);
const GLOBAL_SECTIONS = new Set(['settings', 'soundtrack']);
function normalizeScope(value) { return value === 'task' ? 'task' : value === 'global' ? 'global' : null; }
function taskIdFrom(value) { const id = typeof value === 'string' ? value.trim() : ''; return TASK_ID.test(id) ? id : null; }
function sectionsFrom(value, allowed) { if (!Array.isArray(value)) return undefined; const sections = [...new Set(value.filter(item => allowed.has(item)))]; return sections.length ? sections : undefined; }
function send(res, status, payload) { res.setHeader('Cache-Control', 'no-store'); return res.status(status).json(payload); }

export default async function handler(req, res) {
  if (!storageConfigured()) return send(res, 503, { error: 'Cloud sync is not configured' });
  try {
    if (req.method === 'GET') {
      const scope = normalizeScope(req.query?.scope);
      if (!scope) return send(res, 400, { error: 'Invalid sync scope' });
      const taskId = scope === 'task' ? taskIdFrom(req.query?.taskId) : null;
      if (scope === 'task' && !taskId) return send(res, 400, { error: 'Invalid task ID' });
      return send(res, 200, { data: await getSyncState(scope, taskId) });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const rawLength = Number(req.headers?.['content-length'] || 0);
      if (rawLength > MAX_BODY_BYTES) return send(res, 413, { error: 'Sync payload is too large' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const scope = normalizeScope(body.scope);
      if (!scope) return send(res, 400, { error: 'Invalid sync scope' });
      const taskId = scope === 'task' ? taskIdFrom(body.taskId) : null;
      if (scope === 'task' && !taskId) return send(res, 400, { error: 'Invalid task ID' });
      if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return send(res, 400, { error: 'Invalid sync data' });
      if (Buffer.byteLength(JSON.stringify(body.data), 'utf8') > MAX_BODY_BYTES) return send(res, 413, { error: 'Sync payload is too large' });
      const sections = sectionsFrom(body.sections, scope === 'task' ? TASK_SECTIONS : GLOBAL_SECTIONS);
      return send(res, 200, { data: await setSyncState(scope, taskId, body.data, sections) });
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (error) { return send(res, 500, { error: error.message || 'Cloud sync failed' }); }
}
