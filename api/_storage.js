const REDIS_URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const NAMESPACE = () => process.env.FOCUS_SYNC_NAMESPACE || 'personal';

export function storageConfigured() { return Boolean(REDIS_URL() && REDIS_TOKEN()); }

async function command(args) {
  if (!storageConfigured()) { const error = new Error('Focus sync storage is not configured'); error.code = 'STORAGE_NOT_CONFIGURED'; throw error; }
  const response = await fetch(REDIS_URL(), { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Storage request failed (${response.status})`);
  return payload.result;
}

function baseKey() { return `deep-focus:${NAMESPACE()}`; }
function key(scope, taskId, section) {
  if (scope === 'global') return section ? `${baseKey()}:global:${section}` : `${baseKey()}:global`;
  const base = `${baseKey()}:task:${taskId}`;
  return section ? `${base}:${section}` : base;
}
function parse(raw) { if (!raw) return null; try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; } }
function looksLikeSoundtrack(value) { return Boolean(value && (Array.isArray(value.focusPlaylistUrls) || Array.isArray(value.breakPlaylistUrls) || value.playback)); }

export async function getSyncState(scope, taskId) {
  if (scope === 'global') {
    const values = await command(['MGET', key('global', null, 'settings'), key('global', null, 'soundtrack'), key('global')]);
    const [settingsRaw, soundtrackRaw, legacyRaw] = Array.isArray(values) ? values : [null, null, null];
    const legacy = parse(legacyRaw) || {};
    const settings = parse(settingsRaw) || legacy.settings || (!looksLikeSoundtrack(legacy) ? legacy : null);
    const soundtrack = parse(soundtrackRaw) || legacy.soundtrack || (looksLikeSoundtrack(legacy) ? legacy : null);
    if (!settings && !soundtrack) return null;
    return { version: 3, settings, soundtrack, updatedAt: Math.max(Number(settings?.updatedAt) || 0, Number(soundtrack?.updatedAt) || 0, Number(legacy.updatedAt) || 0) };
  }
  const values = await command(['MGET', key('task', taskId, 'timer'), key('task', taskId, 'soundtrack'), key('task', taskId)]);
  const [timerRaw, soundtrackRaw, legacyRaw] = Array.isArray(values) ? values : [null, null, null];
  const legacy = parse(legacyRaw) || {};
  const timer = parse(timerRaw) || legacy.timer || null;
  const soundtrack = parse(soundtrackRaw) || legacy.soundtrack || null;
  if (!timer && !soundtrack) return null;
  return { version: 2, timer, soundtrack, updatedAt: Math.max(Number(timer?.updatedAt) || 0, Number(soundtrack?.updatedAt) || 0, Number(legacy.updatedAt) || 0) };
}

export async function setSyncState(scope, taskId, data, sections) {
  if (scope === 'global') {
    const requested = new Set(Array.isArray(sections) && sections.length ? sections : ['settings', 'soundtrack']);
    const writes = [];
    if (requested.has('settings') && data?.settings) {
      const settings = { ...data.settings, updatedAt: Number(data.settings.updatedAt) || Date.now() };
      writes.push(command(['SET', key('global', null, 'settings'), JSON.stringify(settings)]));
    }
    if (requested.has('soundtrack') && data?.soundtrack) {
      const soundtrack = { ...data.soundtrack, updatedAt: Number(data.soundtrack.updatedAt) || Date.now() };
      writes.push(command(['SET', key('global', null, 'soundtrack'), JSON.stringify(soundtrack)]));
    }
    await Promise.all(writes);
    return getSyncState('global');
  }
  const requested = new Set(Array.isArray(sections) && sections.length ? sections : ['timer', 'soundtrack']);
  const writes = [];
  if (requested.has('timer') && data?.timer) {
    const timer = { ...data.timer, updatedAt: Number(data.timer.updatedAt) || Date.now() };
    writes.push(command(['SET', key('task', taskId, 'timer'), JSON.stringify(timer)]));
  }
  if (requested.has('soundtrack') && data?.soundtrack) {
    const soundtrack = { ...data.soundtrack, updatedAt: Number(data.soundtrack.updatedAt) || Date.now() };
    writes.push(command(['SET', key('task', taskId, 'soundtrack'), JSON.stringify(soundtrack)]));
  }
  await Promise.all(writes);
  return getSyncState('task', taskId);
}
