#!/usr/bin/env bash
# One-time setup for the Peptide Tracker push backend.
# Generates VAPID keys, creates the Cloudflare KV store, stores the private key as a
# secret, deploys the Worker, and wires the public key + Worker URL into the PWA.
# Re-runnable; safe to stop and resume.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"

echo "==> Installing deps (wrangler + push lib)…"
npm install || { echo "npm install failed"; exit 1; }

if [ -f .vapid.json ]; then
  echo "==> Reusing existing VAPID keys (.vapid.json) — delete that file to rotate…"
  KEYS_JSON="$(cat .vapid.json)"
else
  echo "==> Generating VAPID keys…"
  KEYS_JSON="$(npx --yes web-push generate-vapid-keys --json)"
fi
PUB="$(printf '%s' "$KEYS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).publicKey))')"
PRIV="$(printf '%s' "$KEYS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).privateKey))')"
printf '%s' "$KEYS_JSON" > .vapid.json
echo "    public key : $PUB"
echo "    (key pair saved to push-worker/.vapid.json — gitignored)"

echo "==> Logging in to Cloudflare (a browser window will open; approve it)…"
npx wrangler login

echo "==> Creating KV namespace PEPTIDE_KV…"
KV_OUT="$(npx wrangler kv namespace create PEPTIDE_KV 2>&1)" || true
echo "$KV_OUT"
KV_ID="$(printf '%s' "$KV_OUT" | grep -oE '[a-f0-9]{32}' | head -1)"
if [ -n "${KV_ID:-}" ]; then
  echo "    KV id: $KV_ID"
  sed -i.bak "s/PUT_YOUR_KV_NAMESPACE_ID_HERE/$KV_ID/" wrangler.toml && rm -f wrangler.toml.bak
else
  echo "    !! Couldn't auto-read the KV id — copy it from the output above into wrangler.toml."
fi

# Wire the public key into wrangler.toml
sed -i.bak "s|PUT_YOUR_VAPID_PUBLIC_KEY_HERE|$PUB|" wrangler.toml && rm -f wrangler.toml.bak

echo "==> Storing the VAPID private key as a Worker secret…"
printf '%s' "$PRIV" | npx wrangler secret put VAPID_PRIVATE_KEY

echo "==> Deploying the Worker…"
DEPLOY_OUT="$(npx wrangler deploy 2>&1)"
echo "$DEPLOY_OUT"
WORKER_URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9._-]*workers\.dev' | head -1)"

echo
echo "============================================================"
if [ -n "${WORKER_URL:-}" ]; then
  echo "Worker URL : $WORKER_URL"
  node -e '
    const fs=require("fs"); const f=process.argv[1];
    let h=fs.readFileSync(f,"utf8");
    const line=`window.PEPTIDE_PUSH = { workerUrl: "${process.argv[2]}", vapidPublicKey: "${process.argv[3]}" };`;
    if(/window\.PEPTIDE_PUSH\s*=\s*\{[^}]*\};/.test(h)){ h=h.replace(/window\.PEPTIDE_PUSH\s*=\s*\{[^}]*\};/, line); fs.writeFileSync(f,h); console.log("    wired into index.html ✓"); }
    else { console.log("    !! Could not find window.PEPTIDE_PUSH in index.html — add this line in <head>:\n    "+line); }
  ' "$ROOT/index.html" "$WORKER_URL" "$PUB"
else
  echo "Couldn't auto-detect the Worker URL. Put these two into index.html (window.PEPTIDE_PUSH):"
  echo "  workerUrl      = <your *.workers.dev URL from the deploy output above>"
  echo "  vapidPublicKey = $PUB"
fi
echo "============================================================"
echo
echo "Done. Next:"
echo "  1. git add -A && git commit -m 'wire push backend' && git push   (from $ROOT)"
echo "  2. On your iPhone: reopen the home-screen app, Settings ->"
echo "     'Background reminders' -> Turn on -> allow notifications."
echo "  3. Test: set the reminder time to a minute or two ahead and wait."
