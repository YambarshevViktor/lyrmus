// Pages Function: машинный перевод строк текста (MyMemory, бесплатно, без ключа).
// POST /api/translate {sl:'en', tl:'ru', q:[строки]} → {tr:[переводы|null], failed:n}.
// Google gtx не подошёл: отдаёт 429 автоматическим запросам (проверено 30.10.2026).
// MyMemory: q ≤ 500 байт на запрос, анонимно 5000 символов/день; с `de`=email — 50000.
// Email кладётся в env функции MYMEMORY_EMAIL (в коде его нет), без него — анонимный режим.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function json(obj, code) {
  return new Response(JSON.stringify(obj), {
    status: code || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function byteLen(s) {
  try { return new TextEncoder().encode(s).length; }
  catch (e) { return s.length * 3; }
}

async function translateChunk(lines, sl, tl, de, env) {
  let u = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(lines.join('\n'))
    + '&langpair=' + encodeURIComponent(sl + '|' + tl);
  const email = (env && env.MYMEMORY_EMAIL) || de;
  if (email) u += '&de=' + encodeURIComponent(email);
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.responseStatus !== 200 || !j.responseData || typeof j.responseData.translatedText !== 'string') return null;
  const parts = j.responseData.translatedText.split('\n');
  return parts.length === lines.length ? parts : null;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const sl = String(body.sl || 'en').slice(0, 8);
  const tl = String(body.tl || 'ru').slice(0, 5);
  const de = String(body.de || '').slice(0, 80);
  const q = Array.isArray(body.q) ? body.q.map(String) : [];
  if (!q.length) return json({ tr: [] });
  // режем на куски ≤450 байт (лимит MyMemory — 500 байт на запрос)
  const chunks = [];
  let cur = [], len = 0;
  q.forEach(line => {
    const bl = byteLen(line) + 1;
    if (cur.length && len + bl > 450) { chunks.push(cur); cur = []; len = 0; }
    cur.push(line); len += bl;
  });
  if (cur.length) chunks.push(cur);
  const out = [];
  let failed = 0;
  for (const ch of chunks) {
    try {
      const parts = await translateChunk(ch, sl, tl, de, env);
      if (parts) parts.forEach(p => out.push(p));
      else { failed++; ch.forEach(() => out.push(null)); }
    } catch (e) { failed++; ch.forEach(() => out.push(null)); }
  }
  return json({ tr: out, failed });
}
