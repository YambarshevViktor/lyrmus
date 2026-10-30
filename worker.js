// Cloudflare Worker: YouTube search proxy for the lyrics page.
// Deploy: dash.cloudflare.com → Workers & Pages → Create → paste this → Deploy.
// The page calls: GET {worker-url}/api/ytsearch?q=... → {items:[{id,title,channel,duration}]}
// Free tier is enough. No keys, no storage.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function durToSec(s) {
  s = (s || '').trim();
  let m = s.match(/(?:(\d+):)?(\d+):(\d+)$/);
  if (m) return (parseInt(m[1] || '0', 10)) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  const low = s.toLowerCase();
  const hasH = low.includes('hour') || low.includes('час');
  const hasM = low.includes('minut') || low.includes('мин');
  const hasS = low.includes('second') || low.includes('сек');
  const units = [['h', hasH], ['m', hasM], ['s', hasS]].filter(([, has]) => has).map(([u]) => u);
  if (!units.length) return null;
  const vals = nums.slice(-units.length);
  let total = 0;
  units.forEach((u, i) => { total += vals[i] * (u === 'h' ? 3600 : u === 'm' ? 60 : 1); });
  return total;
}

function blockDuration(block) {
  let m = block.match(/"lengthText":\{"simpleText":"(.*?)"/);
  if (m) return durToSec(m[1]);
  m = block.match(/"lengthText":\{"accessibility":\{"accessibilityData":\{"label":"(.*?)"/);
  if (m) return durToSec(m[1]);
  return null;
}

function unesc(s) {
  return s.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function ytSearchParse(html) {
  const out = [], seen = new Set();
  const blocks = html.split('"videoRenderer":').slice(1);
  for (const block of blocks) {
    const m = block.match(/"videoId":"([\w-]{11})"/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const t = block.match(/"title":\{"runs":\[\{"text":"(.*?)"/);
    const c = block.match(/"longBylineText":\{"runs":\[\{"text":"(.*?)"/);
    out.push({
      id: m[1],
      title: t ? unesc(t[1]) : '',
      channel: c ? unesc(c[1]) : '',
      duration: blockDuration(block),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function corsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  }, extra || {});
}

function json(obj, code) {
  return new Response(JSON.stringify(obj), {
    status: code || 200,
    headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    const url = new URL(req.url);
    if (!url.pathname.endsWith('/ytsearch')) {
      return new Response('not found', { status: 404, headers: corsHeaders() });
    }
    const q = url.searchParams.get('q') || '';
    if (!q.trim()) return json({ items: [] });
    try {
      const r = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&hl=ru', {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' },
      });
      const html = await r.text();
      return json({ items: ytSearchParse(html) });
    } catch (e) {
      return json({ error: 'ytsearch failed: ' + (e && e.message || e) }, 502);
    }
  },
};
