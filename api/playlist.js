import { emptyPlaylist, getPlaylist, setPlaylist, storageConfigured } from './_storage.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const ALLOWED_MODES = new Set(['sequence', 'shuffle']);

function cleanId(value) {
  const id = String(value || '').trim();
  return ID_PATTERN.test(id) ? id : null;
}

function cleanPlaylist(input, id) {
  const tracks = Array.isArray(input?.tracks) ? input.tracks.slice(0, 200).flatMap((track) => {
    const type = track?.type === 'youtube' ? 'youtube' : track?.type === 'audio' ? 'audio' : null;
    const src = String(track?.src || '').trim().slice(0, 2000);
    const title = String(track?.title || 'Untitled track').trim().slice(0, 500);
    if (!type || !src) return [];
    const duration = Number(track?.duration);
    return [{ type, src, title, ...(Number.isFinite(duration) && duration > 0 ? { duration: Math.round(duration) } : {}) }];
  }) : [];

  const rawVolume = Number(input?.volume);
  const volume = Number.isFinite(rawVolume) ? Math.round(Math.min(100, Math.max(0, rawVolume))) : 80;

  return {
    v: 4,
    id,
    tracks,
    mode: ALLOWED_MODES.has(input?.mode) ? input.mode : 'sequence',
    loop: Boolean(input?.loop),
    fade: [0, 2, 3, 5].includes(Number(input?.fade)) ? Number(input.fade) : 2,
    volume,
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const id = cleanId(req.query?.id);
  if (!id) return res.status(400).json({ error: 'A valid playlist id is required' });
  if (!storageConfigured()) {
    return res.status(503).json({
      error: 'Server storage is not configured',
      code: 'STORAGE_NOT_CONFIGURED',
      fallback: 'local',
    });
  }

  try {
    if (req.method === 'GET') {
      const playlist = await getPlaylist(id);
      return res.status(200).json({ playlist: playlist || emptyPlaylist(id) });
    }

    const playlist = cleanPlaylist(req.body?.playlist || req.body, id);
    await setPlaylist(id, playlist);
    return res.status(200).json({ playlist });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
