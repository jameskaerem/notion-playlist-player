function youtubeId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;
    if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/').filter(Boolean).pop() || null;
    }
    return url.searchParams.get('v');
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const source = typeof req.query?.url === 'string' ? req.query.url : '';
  const id = youtubeId(source);
  if (!id) return res.status(400).json({ error: 'Invalid YouTube URL' });

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Could not load YouTube title');
    return res.status(200).json({ id, title: data.title || `YouTube video ${id}`, authorName: data.author_name || null });
  } catch (error) {
    return res.status(502).json({ id, title: `YouTube video ${id}`, error: error.message });
  }
}
