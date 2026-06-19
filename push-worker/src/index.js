import { buildPushPayload } from '@block65/webcrypto-web-push';

/* The ONLY content this server ever sends — a constant string, never peptide data.
   iOS revokes a subscription if pushes don't result in a visible notification, so we
   must send a real (encrypted) payload; the app fills in what's actually due when opened. */
const MESSAGE = '\u{1F48A} time for your peptides';

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
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
      const { subscription, time, tz } = body || {};
      if (!subscription || !subscription.endpoint || !/^\d{2}:\d{2}$/.test(time || '')) {
        return json({ error: 'missing or bad fields' }, 400, origin);
      }
      const rec = { subscription, time, tz: String(tz || 'UTC').slice(0, 64), lastSent: '' };
      await env.PEPTIDE_KV.put('sub', JSON.stringify(rec));
      return json({ ok: true }, 200, origin);
    }

    if (req.method === 'POST' && url.pathname === '/unsubscribe') {
      await env.PEPTIDE_KV.delete('sub');
      return json({ ok: true }, 200, origin);
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

  let now;
  try { now = nowInTz(rec.tz); } catch { now = nowInTz('UTC'); }
  if (rec.lastSent === now.date) return; // already sent today, in the user's own timezone

  const [th, tm] = rec.time.split(':').map(Number);
  const target = th * 60 + tm;
  if (now.minutes < target || now.minutes > target + 2) return; // 3-minute catch-up window

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
    rec.lastSent = now.date;
    await env.PEPTIDE_KV.put('sub', JSON.stringify(rec));
  } catch (_) {
    // transient failure: leave lastSent unset so the next tick (still in-window) retries
  }
}
