# Peptide Tracker

A small, good-looking personal web app to track peptide doses, on/off cycles, and a dose-history calendar — with an AI assistant that knows your current schedule. Installs to your iPhone/Android home screen as a PWA. **No backend: all your data stays on your device** (localStorage). The only network call is the AI chat, which goes straight from your browser to the Claude API using a key you enter in Settings.

## Use it
Open `index.html` over HTTPS (or `http://localhost`) — a service worker + home-screen install need a secure context, so `file://` won't enable those.

- **Today** — what's due, tap to log, streak + counts
- **Peptides** — add/edit dose, schedule (daily / every-other-day / specific days), weeks-on/weeks-off cycle
- **History** — month calendar with adherence colouring; tap a day to log/correct past doses
- **Ask AI** — Claude chat, primed with your live cycle status (add your API key in Settings)
- **Settings** — key, model, reminder time, export/import/reset

## Reminders
Best-effort and **foreground-only on iPhone** — Apple gives web apps no way to fire a notification once the app is fully closed without a push server. Keep a backup alarm for anything time-critical.

## Icons
Regenerate with `python3 tools/generate_icons.py` (needs Pillow).

## Disclaimer
Personal tracking tool, not medical advice. Confirm any protocol with a qualified clinician.
