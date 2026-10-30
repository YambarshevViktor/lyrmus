// Pages Function: машинный перевод строк текста (Google, бесплатно, без ключа).
// POST /api/translate {sl:'auto', tl:'ru', q:[строки]} → {tr:[переводы|null]}.
// Ключ нигде не нужен — используется открытый endpoint translate.googleapis.com.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function json(obj, code) {
  return new Response(JSON.stringify(obj), {
    status: code || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function translateChunk(lines, sl, tl) {
  const u = 'https://translate.googleapis.com/translate_a/single?client=gtx'
    + '&sl=' + encodeURIComponent(sl) + '&tl=' + encodeURIComponent(tl)
    + '&dt=t&q=' + encodeURIComponent(lines.join('\n'));
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const j = await r.json();
  const full = (j[0] || []).map(s => s[0] || '').join('');
  const parts = full.split('\n');
  return parts.length === lines.length ? parts : null;
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const sl = String(body.sl || 'auto').slice(0, 8);
  const tl = String(body.tl || 'ru').slice(0, 5);
  const q = Array.isArray(body.q) ? body.q.map(String) : [];
  if (!q.length) return json({ tr: [] });
  // режем на куски ~1500 символов, чтобы не упереться в лимит URL
  const chunks = [];
  let cur = [], len = 0;
  q.forEach(line => {
    cur.push(line); len += line.length + 1;
    if (len > 1500) { chunks.push(cur); cur = []; len = 0; }
  });
  if (cur.length) chunks.push(cur);
  const out = [];
  for (const ch of chunks) {
    try {
      const parts = await translateChunk(ch, sl, tl);
      if (parts) parts.forEach(p => out.push(p));
      else ch.forEach(() => out.push(null));
    } catch (e) { ch.forEach(() => out.push(null)); }
  }
  return json({ tr: out });
}
