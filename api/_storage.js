const REDIS_URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export function storageConfigured() {
  return Boolean(REDIS_URL() && REDIS_TOKEN());
}

async function command(args) {
  if (!storageConfigured()) {
    const error = new Error('Playlist storage is not configured');
    error.code = 'STORAGE_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(REDIS_URL(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Storage request failed (${response.status})`);
  }
  return payload.result;
}

export async function getPlaylist(id) {
  const raw = await command(['GET', `notion-playlist:${id}`]);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function setPlaylist(id, playlist) {
  await command(['SET', `notion-playlist:${id}`, JSON.stringify(playlist)]);
  return playlist;
}

export function emptyPlaylist(id) {
  return {
    v: 3,
    id,
    tracks: [],
    mode: 'sequence',
    loop: false,
    fade: 2,
    updatedAt: new Date().toISOString(),
  };
}
