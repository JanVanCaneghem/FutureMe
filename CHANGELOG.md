# Changelog

## 1.3.1 — 2026-10-18
Connects Future Me to the Supabase counter so the website can show real totals.

- **Anonymous stats (on by default, switch off in Settings).** Sends a random install code, version and browser family once a day; plus the shop domain and amount when someone skips a purchase, sees the transfer QR, or answers "did the transfer go through?" (yes or not yet).
- **Never sent:** product, page, URL, reason, name, IBAN.
- **Offline-proof:** events wait in a small local queue (max 100) and go out on the next try. Switching stats off empties the queue.
- **Database:** `supabase/migrations/` holds the tables and functions. The add-on can only write through four logging functions; nobody can read individual rows. `public_stats()` returns totals only.
- **Texts:** store description and settings updated in English and Dutch so the privacy promise stays honest.
- No new browser permissions, so existing installs update without a new permission prompt.

## 1.3.0
Design system from the logo applied to the whole extension (overlay, popup, settings, toolbar icon).
