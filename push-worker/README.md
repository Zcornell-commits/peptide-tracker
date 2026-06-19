# Peptide Tracker — push backend

A tiny Cloudflare Worker that fires a daily **"💊 time for your peptides"** notification at your chosen time, even when the app is fully closed. This is the only way to get closed-app reminders on iPhone (Apple gives web apps no offline-scheduled local notifications).

**Privacy:** the server stores exactly one record — `{ push token, time, timezone }`. No peptide names, doses, logs, or API key ever leave your phone. The notification text is a fixed constant.

**Cost:** free. Cloudflare Workers + Cron Triggers + KV all sit inside the free tier (a per-minute cron is 1,440 runs/day vs the 100k/day free limit).

---

## One-time setup

You need a free Cloudflare account (sign up at dash.cloudflare.com). Then, from this folder:

```bash
cd ~/peptide-tracker/push-worker
./setup.sh
```

The script: installs deps → generates VAPID keys → logs you into Cloudflare (opens a browser) → creates the KV store → saves the private key as a Worker **secret** → deploys → and writes the Worker URL + public key into `../index.html`. The private key is never printed to anything but the secret store and a gitignored `.vapid.json`.

Then commit the updated `index.html` and push:

```bash
cd ~/peptide-tracker
git add -A && git commit -m "wire push backend" && git push
```

Finally, on your iPhone: open the home-screen app → **Settings → Background reminders → Turn on** → allow notifications.

### If a step fails (manual fallback)

```bash
npm install
npx web-push generate-vapid-keys          # note the public + private keys
npx wrangler login
npx wrangler kv namespace create PEPTIDE_KV  # paste the id into wrangler.toml
# put the public key into wrangler.toml (VAPID_PUBLIC_KEY)
printf '%s' "<PRIVATE KEY>" | npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy                        # note the https://…workers.dev URL
```
Then set both values in `index.html`:
```html
<script>window.PEPTIDE_PUSH = { workerUrl: "https://…workers.dev", vapidPublicKey: "<PUBLIC KEY>" };</script>
```

---

## How it works

- **Client** (in the PWA): when you turn reminders on, it subscribes via the Push API and POSTs `{ subscription, time, tz }` to `…/save-subscription`. On every launch it re-validates the subscription and re-subscribes if iOS dropped it (there's no `pushsubscriptionchange` event on iOS, so this self-heal is what keeps it working after a reinstall).
- **Worker cron** runs every minute, checks whether the current time in your timezone matches your reminder time, and if so sends one push (guarded so it only fires once per day). A `404/410` from the push service means the subscription died, so it's deleted.

## Endpoints
- `POST /save-subscription` — `{ subscription, time:"HH:MM", tz:"Australia/Melbourne" }`
- `POST /unsubscribe`
- `GET /health`

## Notes
- Reliable when you open the app most days. It is **not** a hard real-time alarm — worst case ~1 min late, and a push can expire (TTL 1h) if the phone is offline at send time. Keep a native iOS alarm as a backstop for anything you truly can't miss.
- Watch it live while testing: `npm run tail`.
