import { emptyPlaylist, getPlaylist, setPlaylist, storageConfigured } from './_storage.js';

const NOTION_API = 'https:' + '//api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';
const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function notionHeaders() {
  if (!process.env.NOTION_TOKEN) throw new Error('Missing NOTION_TOKEN');
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notion(path, options = {}) {
  const response = await fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: notionHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Notion request failed (${response.status})`);
  return payload;
}

function normalizePageId(value) {
  const match = String(value || '').match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i);
  return match && UUID_PATTERN.test(match[0]) ? match[0].replace(/-/g, '') : null;
}

function findPageId(body) {
  const direct = [body?.page_id, body?.pageId, body?.page?.id, body?.data?.page_id, body?.data?.pageId, body?.data?.id];
  for (const value of direct) {
    const id = normalizePageId(value);
    if (id) return id;
  }
  return null;
}

function appUrl(req) {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.headers.host;
  if (!host) throw new Error('Missing PUBLIC_APP_URL');
  return `${host.startsWith('http') ? '' : 'https://'}${host}`.replace(/\/$/, '');
}

async function listChildren(pageId) {
  const items = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const result = await notion(`/blocks/${pageId}/children?${query}`, { method: 'GET' });
    items.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return items;
}

function samePlayerUrl(candidate, baseUrl) {
  try {
    const a = new URL(candidate);
    const b = new URL(baseUrl);
    return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
}

async function appendEmbed(pageId, url) {
  await notion(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({ children: [{ object: 'block', type: 'embed', embed: { url } }] }),
  });
}

async function installEmbed(pageId, baseUrl, embedUrl) {
  const children = await listChildren(pageId);
  const embeds = children.filter((block) => block.type === 'embed' && block.embed?.url);
  const existing = embeds.find((block) => block.embed.url === embedUrl);
  if (existing) return 'already-installed';

  const placeholder = embeds.find((block) => samePlayerUrl(block.embed.url, baseUrl) && !new URL(block.embed.url).searchParams.has('playlist'));
  if (placeholder) {
    try {
      await notion(`/blocks/${placeholder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ embed: { url: embedUrl } }),
      });
      return 'placeholder-updated';
    } catch {
      await appendEmbed(pageId, embedUrl);
      try { await notion(`/blocks/${placeholder.id}`, { method: 'DELETE' }); } catch {}
      return 'placeholder-replaced';
    }
  }

  await appendEmbed(pageId, embedUrl);
  return 'embed-added';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expectedSecret = process.env.WEBHOOK_SECRET;
  const suppliedSecret = req.headers['x-webhook-secret'] || req.query?.secret || req.body?.secret;
  if (expectedSecret && suppliedSecret !== expectedSecret) return res.status(401).json({ error: 'Invalid webhook secret' });

  const pageId = findPageId(req.body || {});
  if (!pageId) return res.status(400).json({ error: 'The webhook body must include page_id' });
  if (!storageConfigured()) return res.status(503).json({ error: 'Server storage is not configured', code: 'STORAGE_NOT_CONFIGURED' });

  try {
    if (!(await getPlaylist(pageId))) await setPlaylist(pageId, emptyPlaylist(pageId));
    const baseUrl = appUrl(req);
    const embedUrl = `${baseUrl}/?playlist=${encodeURIComponent(pageId)}`;
    const action = await installEmbed(pageId, baseUrl, embedUrl);
    return res.status(200).json({ ok: true, pageId, embedUrl, action });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
