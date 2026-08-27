const NOTION_VERSION = '2025-09-03';
const NOTION_API = 'https:' + '//api.notion.com/v1';
const PAGE_CACHE = new Map();
const SUPPORTED_CATEGORY_TYPES = new Set([
  'relation',
  'select',
  'multi_select',
  'status',
  'rich_text',
  'people',
  'checkbox',
]);
const EXCLUDED_CATEGORY_PROPERTIES = new Set(['Parent item', 'Sub-item', 'Focus block']);

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

async function loadPage(id) {
  if (!PAGE_CACHE.has(id)) PAGE_CACHE.set(id, notion(`/pages/${id}`, { method: 'GET' }));
  return PAGE_CACHE.get(id);
}

function pageTitle(page) {
  const titleProperty = Object.values(page.properties || {}).find((property) => property?.type === 'title');
  return plainText(titleProperty?.title) || 'Unnamed relation value';
}

function propertyHasValue(property, type) {
  if (!property) return false;
  if (type === 'relation') return (property.relation || []).length > 0;
  if (type === 'multi_select') return (property.multi_select || []).length > 0;
  if (type === 'select') return Boolean(property.select?.name);
  if (type === 'status') return Boolean(property.status?.name);
  if (type === 'rich_text') return Boolean(plainText(property.rich_text).trim());
  if (type === 'people') return (property.people || []).length > 0;
  if (type === 'checkbox') return typeof property.checkbox === 'boolean';
  return false;
}

function directValues(property, type) {
  if (!property) return [];
  if (type === 'select') return property.select?.name ? [property.select.name] : [];
  if (type === 'status') return property.status?.name ? [property.status.name] : [];
  if (type === 'multi_select') return (property.multi_select || []).map((item) => item.name).filter(Boolean);
  if (type === 'rich_text') {
    const value = plainText(property.rich_text).trim();
    return value ? [value] : [];
  }
  if (type === 'people') return (property.people || []).map((person) => person.name || person.person?.email || person.id).filter(Boolean);
  if (type === 'checkbox') return [property.checkbox ? 'Checked' : 'Unchecked'];
  return [];
}

async function sourcePropertyForSession(page, propertyName, propertyType) {
  const ownProperty = page.properties?.[propertyName];
  if (propertyHasValue(ownProperty, propertyType)) return ownProperty;
  const parentId = page.properties?.['Parent item']?.relation?.[0]?.id;
  if (!parentId) return ownProperty;
  try {
    const parent = await loadPage(parentId);
    return parent.properties?.[propertyName] || ownProperty;
  } catch {
    return ownProperty;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const dataSourceId = process.env.TASKS_DATA_SOURCE_ID;
    if (!dataSourceId) throw new Error('Missing TASKS_DATA_SOURCE_ID');

    const dataSource = await notion(`/data_sources/${dataSourceId}`, { method: 'GET' });
    const categoryProperties = Object.entries(dataSource.properties || {})
      .filter(([name, property]) => SUPPORTED_CATEGORY_TYPES.has(property.type) && !EXCLUDED_CATEGORY_PROPERTIES.has(name))
      .map(([name, property]) => ({ id: property.id, name, type: property.type }))
      .sort((a, b) => {
        if (a.name === 'Area') return -1;
        if (b.name === 'Area') return 1;
        return a.name.localeCompare(b.name, 'cs');
      });

    if (!categoryProperties.length) throw new Error('No supported category properties found in Tasks');
    const requested = typeof req.query?.groupBy === 'string' ? req.query.groupBy : 'Area';
    const selectedProperty = categoryProperties.find((property) => property.name === requested)
      || categoryProperties.find((property) => property.name === 'Area')
      || categoryProperties[0];

    const pages = [];
    let cursor;
    const since = new Date(Date.now() - 93 * 24 * 60 * 60 * 1000).toISOString();

    do {
      const payload = await notion(`/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          filter: {
            and: [
              { property: 'Focus block', date: { is_not_empty: true } },
              { property: 'Focus block', date: { on_or_after: since } },
            ],
          },
          sorts: [{ property: 'Focus block', direction: 'descending' }],
        }),
      });
      pages.push(...payload.results);
      cursor = payload.has_more ? payload.next_cursor : null;
    } while (cursor);

    const sessionProperties = await Promise.all(pages.map(async (page) => ({
      page,
      categoryProperty: await sourcePropertyForSession(page, selectedProperty.name, selectedProperty.type),
    })));

    let relationNamesById = new Map();
    if (selectedProperty.type === 'relation') {
      const relationIds = [...new Set(sessionProperties.flatMap(({ categoryProperty }) =>
        (categoryProperty?.relation || []).map((item) => item.id)
      ))];
      const entries = await Promise.all(relationIds.map(async (id) => {
        try {
          return [id, pageTitle(await loadPage(id))];
        } catch {
          return [id, 'Unavailable relation value'];
        }
      }));
      relationNamesById = new Map(entries);
    }

    const emptyLabel = `No ${selectedProperty.name}`;
    const sessions = sessionProperties.flatMap(({ page, categoryProperty }) => {
      const focus = page.properties?.['Focus block']?.date;
      if (!focus?.start || !focus?.end) return [];
      const startedAt = new Date(focus.start);
      const endedAt = new Date(focus.end);
      if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) return [];
      const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60000));
      const categoryNames = selectedProperty.type === 'relation'
        ? (categoryProperty?.relation || []).map((item) => relationNamesById.get(item.id)).filter(Boolean)
        : directValues(categoryProperty, selectedProperty.type);
      return [{
        id: page.id,
        startedAt: focus.start,
        endedAt: focus.end,
        minutes,
        categoryNames: categoryNames.length ? [...new Set(categoryNames)] : [emptyLabel],
      }];
    });

    const categoryValues = [...new Set(sessions.flatMap((session) => session.categoryNames))]
      .sort((a, b) => a.localeCompare(b, 'cs'));

    return res.status(200).json({
      sessions,
      categoryProperties,
      categoryValues,
      groupBy: selectedProperty.name,
      groupByType: selectedProperty.type,
      total: sessions.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
