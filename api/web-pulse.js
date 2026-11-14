/**
 * Vercel Serverless Function: /api/web-pulse
 * Extrae titulares y resúmenes reales desde feeds RSS públicos sin restricciones CORS.
 * Cero dependencias externas (usa fetch nativo de Node 18+ en Vercel).
 */

const RSS_FEEDS = [
  { name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml' },
  { name: 'NASA Breaking News', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
  { name: 'Google News Ciencia', url: 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=es-419&gl=US&ceid=US:es-419' }
];

function stripHtml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml, sourceName) {
  const items = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const block of itemMatches.slice(0, 6)) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

    const title = stripHtml(titleMatch?.[1] || '');
    const url = stripHtml(linkMatch?.[1] || '');
    const summary = stripHtml(descMatch?.[1] || '').slice(0, 220);

    if (title && title.length > 12) {
      items.push({ source: sourceName, title, summary, url });
    }
  }
  return items;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');

  const pickedFeed = RSS_FEEDS[Math.floor(Math.random() * RSS_FEEDS.length)];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(pickedFeed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'OraculoCiberFilosofico/1.0' }
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(200).json({ ok: false, items: [] });
    }

    const xml = await response.text();
    const items = parseRssItems(xml, pickedFeed.name);
    return res.status(200).json({ ok: true, feed: pickedFeed.name, items });
  } catch (err) {
    return res.status(200).json({ ok: false, items: [], error: err.message });
  }
};
