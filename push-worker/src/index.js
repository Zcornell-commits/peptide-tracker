import { buildPushPayload } from '@block65/webcrypto-web-push';

/* The ONLY content this server ever sends — a constant string, never peptide data.
   iOS revokes a subscription if pushes don't result in a visible notification, so we
   must send a real (encrypted) payload; the app fills in what's actually due when opened. */
const MESSAGE = '\u{1F48A} time for your peptides';

// Pin CORS to the app's own origin so a random website can't drive the AI proxy from a victim's browser.
const ALLOWED_ORIGINS = ['https://zcornell-commits.github.io'];
const corsOrigin = (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': corsOrigin(origin),
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
});

const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '*';

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname === '/health') return json({ ok: true }, 200, origin);

    // Store / refresh the single subscription. Body: { subscription, time:"HH:MM", tz:"IANA" }.
    if (req.method === 'POST' && url.pathname === '/save-subscription') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
      const { subscription, time, times, tz } = body || {};
      const list = (Array.isArray(times) && times.length ? times : [time])
        .filter(t => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t));
      if (!subscription || !subscription.endpoint || !list.length) {
        return json({ error: 'missing or bad fields' }, 400, origin);
      }
      const uniq = [...new Set(list)];
      // Preserve the per-time "sent today" guard across re-subscribes (the app re-POSTs on every open).
      let prev = {}; try { prev = JSON.parse((await env.PEPTIDE_KV.get('sub')) || '{}'); } catch { prev = {}; }
      const lastSent = {};
      if (prev.lastSent && typeof prev.lastSent === 'object') for (const t of uniq) if (prev.lastSent[t]) lastSent[t] = prev.lastSent[t];
      const rec = { subscription, times: uniq, tz: String(tz || 'UTC').slice(0, 64), lastSent };
      await env.PEPTIDE_KV.put('sub', JSON.stringify(rec));
      return json({ ok: true }, 200, origin);
    }

    if (req.method === 'POST' && url.pathname === '/unsubscribe') {
      await env.PEPTIDE_KV.delete('sub');
      return json({ ok: true }, 200, origin);
    }

    // AI proxy — forwards to Anthropic using a key held as a Worker SECRET (never in the app/repo).
    // Rate-limited per day as a basic abuse guard; also set a spend limit on your Anthropic account.
    if (req.method === 'POST' && url.pathname === '/ai') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI proxy not configured' }, 503, origin);
      const day = new Date().toISOString().slice(0, 10);
      const rlKey = 'ai-rl-' + day;
      const count = parseInt((await env.PEPTIDE_KV.get(rlKey)) || '0', 10);
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
      if (!Array.isArray(body.messages)) return json({ error: 'bad request' }, 400, origin);
      if (count >= 200) return json({ error: 'daily AI limit reached' }, 429, origin);
      await env.PEPTIDE_KV.put(rlKey, String(count + 1), { expirationTtl: 172800 }); // reserve the slot BEFORE the costly call
      const MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'];
      let upstream;
      try {
        upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': (env.ANTHROPIC_API_KEY || '').replace(/\s+/g, ''), 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: MODELS.includes(body.model) ? body.model : 'claude-sonnet-4-6',
            max_tokens: Math.min(2048, Number(body.max_tokens) || 1024),
            system: typeof body.system === 'string' ? body.system : undefined,
            messages: body.messages.slice(-20)
          })
        });
      } catch (_) { return json({ error: 'upstream unreachable' }, 502, origin); }
      const text = await upstream.text();
      return new Response(text, { status: upstream.status, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
    }

    return json({ error: 'not found' }, 404, origin);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(maybeSend(env));
  },
};

// Current wall-clock in a given IANA timezone, as { date:"YYYY-MM-DD", minutes:int }.
function nowInTz(tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const hh = parts.hour === '24' ? 0 : Number(parts.hour); // some runtimes emit '24' at midnight
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hh * 60 + Number(parts.minute) };
}

async function maybeSend(env) {
  const raw = await env.PEPTIDE_KV.get('sub');
  if (!raw) return;
  let rec;
  try { rec = JSON.parse(raw); } catch { return; }

  const times = (Array.isArray(rec.times) && rec.times.length) ? rec.times : (rec.time ? [rec.time] : []);
  if (!times.length) return;

  let now;
  try { now = nowInTz(rec.tz); } catch { now = nowInTz('UTC'); }
  const lastSent = (rec.lastSent && typeof rec.lastSent === 'object') ? rec.lastSent : {};

  // fire the first reminder time whose 3-minute window is open and that hasn't sent yet today
  let dueTime = null;
  for (const t of times) {
    const [th, tm] = t.split(':').map(Number);
    const target = th * 60 + tm;
    if (now.minutes >= target && now.minutes <= target + 2 && lastSent[t] !== now.date) { dueTime = t; break; }
  }
  if (!dueTime) return;

  try {
    const payload = await buildPushPayload(
      { data: MESSAGE, options: { ttl: 3600, urgency: 'high', topic: 'peptide' } },
      rec.subscription,
      { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
    );
    const res = await fetch(rec.subscription.endpoint, payload);
    if (res.status === 404 || res.status === 410) { // subscription is gone — clean up
      await env.PEPTIDE_KV.delete('sub');
      return;
    }
    lastSent[dueTime] = now.date;
    rec.lastSent = lastSent;
    await env.PEPTIDE_KV.put('sub', JSON.stringify(rec));
  } catch (_) {
    // transient failure: leave it unmarked so the next tick (still in-window) retries
  }
}
