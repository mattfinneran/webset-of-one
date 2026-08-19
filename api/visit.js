// POST /api/visit — texts Matt when someone loads thewebsetofone.com.
// Env vars (set in Vercel project settings):
//   TWILIO_ACCOUNT_SID    - AC... account SID (Twilio Console homepage)
//   TWILIO_AUTH_TOKEN     - auth token (Twilio Console homepage, "show")
//   (or instead of AUTH_TOKEN: TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)
//   TWILIO_FROM           - Twilio phone number, E.164
//   MATT_CELL             - +14159902551

const recent = new Map(); // ip -> last SMS ts (best effort; per warm instance)
const COOLDOWN_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const ua = req.headers['user-agent'] || '';
  if (/bot|crawl|spider|preview|facebookexternalhit|slurp|headless/i.test(ua)) {
    return res.status(204).end();
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = ip + '|' + ua.slice(0, 80); // per device/browser, not per network
  const last = recent.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return res.status(204).end();
  recent.set(key, Date.now());

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const path = clip(body.path, 60) || '/';
  const ref = clip(body.ref, 120);

  const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || '');
  const region = req.headers['x-vercel-ip-country-region'] || '';
  const country = req.headers['x-vercel-ip-country'] || '';
  const where = [city, region, country].filter(Boolean).join(', ') || 'location unknown';

  const text =
    `Webset of One visitor\n` +
    `${path} · ${where}\n` +
    `ip ${ip}` +
    (ref ? `\nvia ${ref}` : '') +
    `\n${clip(ua, 90)}`;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authPair = process.env.TWILIO_AUTH_TOKEN
    ? `${sid}:${process.env.TWILIO_AUTH_TOKEN}`
    : `${process.env.TWILIO_API_KEY_SID}:${process.env.TWILIO_API_KEY_SECRET}`;
  const auth = Buffer.from(authPair).toString('base64');

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: process.env.MATT_CELL,
        From: process.env.TWILIO_FROM,
        Body: text,
      }),
    }
  );

  if (!resp.ok) console.error('Twilio error', resp.status, await resp.text());
  return res.status(204).end();
}

function clip(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
