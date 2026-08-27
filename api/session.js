const NOTION_VERSION = '2025-09-03';
const NOTION_API = 'https:' + '//api.notion.com/v1';
const MAX_WORK_SECONDS = 24 * 60 * 60;

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('Missing NOTION_TOKEN');
  return { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' };
}

async function notion(path, options = {}) {
  const response = await fetch(`${NOTION_API}${path}`, { ...options, headers: notionHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Notion request failed');
  return payload;
}

function plainText(items = []) {
  return items.map(item => item.plain_text || item.text?.content || '').join('');
}

function titleOf(page) {
  const property = Object.values(page.properties || {}).find(value => value?.type === 'title');
  return plainText(property?.title) || 'Focus task';
}

function statusOption(schema, desired) {
  const options = schema?.status?.options || [];
  const exact = options.find(option => option.name.toLowerCase() === desired.toLowerCase());
  if (exact) return exact.name;
  if (desired === 'In Progress') return options.find(option => /in.?progress|doing|active/i.test(option.name))?.name || 'In Progress';
  return options.find(option => /done|complete|completed/i.test(option.name))?.name || 'Done';
}

function copyProperty(property, schema) {
  if (!property || !schema || property.type !== schema.type) return null;
  const type = schema.type;
  if (type === 'relation') return { relation: (property.relation || []).map(item => ({ id: item.id })) };
  if (type === 'people') return { people: (property.people || []).map(item => ({ id: item.id })) };
  if (type === 'select') return { select: property.select ? { name: property.select.name } : null };
  if (type === 'multi_select') return { multi_select: (property.multi_select || []).map(item => ({ name: item.name })) };
  if (type === 'status') return { status: property.status ? { name: property.status.name } : null };
  if (type === 'date') return { date: property.date ? { start: property.date.start, end: property.date.end || null, time_zone: property.date.time_zone || null } : null };
  if (type === 'checkbox') return { checkbox: Boolean(property.checkbox) };
  if (type === 'number') return { number: property.number ?? null };
  if (type === 'rich_text') return { rich_text: property.rich_text || [] };
  if (type === 'url') return { url: property.url || null };
  if (type === 'email') return { email: property.email || null };
  if (type === 'phone_number') return { phone_number: property.phone_number || null };
  return null;
}

function validTaskId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{20,64}$/.test(value.trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (!validTaskId(body.taskId)) return res.status(400).json({ error: 'Invalid task ID' });
    const dataSourceId = process.env.TASKS_DATA_SOURCE_ID;
    if (!dataSourceId) throw new Error('Missing TASKS_DATA_SOURCE_ID');

    const createBlock = body.createBlock !== false;
    const markDone = body.markDone === true;
    const workedSeconds = Math.max(0, Math.min(MAX_WORK_SECONDS, Math.round(Number(body.workedSeconds) || 0)));
    const inheritProperties = Array.isArray(body.inheritProperties) ? [...new Set(body.inheritProperties.filter(name => typeof name === 'string'))] : [];
    const task = await notion(`/pages/${body.taskId}`, { method: 'GET' });
    const schema = await notion(`/data_sources/${dataSourceId}`, { method: 'GET' });
    const currentFinished = Math.max(0, Number(task.properties?.Finished?.number) || 0);
    const shouldCreateBlock = createBlock && workedSeconds > 0;
    const nextFinished = currentFinished + (shouldCreateBlock ? 1 : 0);
    const inheritedProperties = [];

    if (shouldCreateBlock) {
      const endedAt = body.endedAt ? new Date(body.endedAt) : new Date();
      if (Number.isNaN(endedAt.getTime())) throw new Error('Invalid session end time');
      const startedAt = new Date(endedAt.getTime() - workedSeconds * 1000);
      const properties = {};
      const titleEntry = Object.entries(schema.properties || {}).find(([, value]) => value.type === 'title');
      if (!titleEntry) throw new Error('Tasks data source has no title property');
      properties[titleEntry[0]] = { title: [{ type: 'text', text: { content: `${titleOf(task)} · DFB (${nextFinished})` } }] };
      if (schema.properties?.['Focus block']?.type !== 'date') throw new Error('Missing date property: Focus block');
      properties['Focus block'] = { date: { start: startedAt.toISOString(), end: endedAt.toISOString() } };
      if (schema.properties?.['Parent item']?.type !== 'relation') throw new Error('Missing relation property: Parent item');
      properties['Parent item'] = { relation: [{ id: body.taskId }] };
      if (schema.properties?.Status?.type === 'status') {
        properties.Status = { status: { name: statusOption(schema.properties.Status, 'Done') } };
      }

      const excluded = new Set([titleEntry[0], 'Name', 'Planned', 'Finished', 'Status', 'Focus block', 'Parent item', 'Sub-item']);
      for (const name of inheritProperties) {
        if (excluded.has(name)) continue;
        const copied = copyProperty(task.properties?.[name], schema.properties?.[name]);
        if (copied) { properties[name] = copied; inheritedProperties.push(name); }
      }

      await notion('/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties }),
      });
    }

    const updates = {};
    if (shouldCreateBlock && task.properties?.Finished?.type === 'number') updates.Finished = { number: nextFinished };
    if (task.properties?.Status?.type === 'status') {
      updates.Status = { status: { name: statusOption(schema.properties?.Status, markDone ? 'Done' : 'In Progress') } };
    }
    if (Object.keys(updates).length) {
      await notion(`/pages/${body.taskId}`, { method: 'PATCH', body: JSON.stringify({ properties: updates }) });
    }

    return res.status(200).json({
      ok: true,
      finished: nextFinished,
      status: markDone ? statusOption(schema.properties?.Status, 'Done') : statusOption(schema.properties?.Status, 'In Progress'),
      createdBlock: shouldCreateBlock,
      workedSeconds: shouldCreateBlock ? workedSeconds : 0,
      startedAt: shouldCreateBlock ? new Date((body.endedAt ? new Date(body.endedAt) : new Date()).getTime() - workedSeconds * 1000).toISOString() : null,
      endedAt: shouldCreateBlock ? (body.endedAt ? new Date(body.endedAt).toISOString() : new Date().toISOString()) : null,
      inheritedProperties,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not update focus session' });
  }
}
