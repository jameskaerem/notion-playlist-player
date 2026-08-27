const NOTION_VERSION = '2025-09-03';
const NOTION_API = 'https:' + '//api.notion.com/v1';
const PAGE_NAME_CACHE = new Map();

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('Missing NOTION_TOKEN');
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function plainText(items = []) {
  return items.map((item) => item.plain_text || item.text?.content || '').join('');
}

async function notion(path, options = {}) {
  const response = await fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: notionHeaders(),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Notion request failed');
  return payload;
}

function pageTitle(page) {
  const titleProperty = Object.values(page.properties || {}).find((property) => property?.type === 'title');
  return plainText(titleProperty?.title) || 'Unnamed Area';
}

async function resolvePageName(id) {
  if (PAGE_NAME_CACHE.has(id)) return PAGE_NAME_CACHE.get(id);
  try {
    const page = await notion(`/pages/${id}`, { method: 'GET' });
    const name = pageTitle(page);
    PAGE_NAME_CACHE.set(id, name);
    return name;
  } catch {
    return 'Unavailable Area';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const dataSourceId = process.env.TASKS_DATA_SOURCE_ID;
    if (!dataSourceId) throw new Error('Missing TASKS_DATA_SOURCE_ID');

    const pages = [];
    let cursor;

    do {
      const payload = await notion(`/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          filter: { property: 'Parent item', relation: { is_empty: true } },
          sorts: [{ property: 'Due Date', direction: 'descending' }],
        }),
      });
      pages.push(...payload.results);
      cursor = payload.has_more ? payload.next_cursor : null;
    } while (cursor);

    const uniqueAreaIds = [...new Set(pages.flatMap((page) =>
      (page.properties?.Area?.relation || []).map((item) => item.id)
    ))];
    const areaEntries = await Promise.all(uniqueAreaIds.map(async (id) => [id, await resolvePageName(id)]));
    const areaNamesById = new Map(areaEntries);

    const tasks = pages
      .map((page) => {
        const areaIds = (page.properties?.Area?.relation || []).map((item) => item.id);
        return {
          id: page.id,
          name: plainText(page.properties?.Name?.title) || 'Untitled task',
          status: page.properties?.Status?.status?.name || 'To-Do',
          planned: page.properties?.Planned?.number || 0,
          finished: page.properties?.Finished?.number || 0,
          due: page.properties?.['Due Date']?.date?.start || null,
          focusMinutes: page.properties?.['Focus Minutes']?.number || 0,
          shortBreakMinutes: page.properties?.['Short Break Minutes']?.formula?.number || 0,
          longBreakMinutes: page.properties?.['Long Break Minutes']?.formula?.number || 0,
          areaIds,
          areaNames: areaIds.map((id) => areaNamesById.get(id)).filter(Boolean),
        };
      })
      .sort((a, b) => {
        const aDone = a.status === 'Done' ? 1 : 0;
        const bDone = b.status === 'Done' ? 1 : 0;
        return aDone - bDone || a.name.localeCompare(b.name, 'cs');
      });

    return res.status(200).json({ tasks, total: tasks.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
