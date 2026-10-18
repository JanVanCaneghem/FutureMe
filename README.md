# Future Me – pause before you pay

A browser extension for Chrome and Edge. When you click "Buy now", "Checkout" or "Place order" in a webshop, Future Me puts a short pause in front of the purchase and shows what the money could become if you invested it instead.

## What it does

- **Pauses at the money moment.** "Buy now", checkout and "Place order" buttons on Amazon, bol, Coolblue, Zalando, Temu, Shein, AliExpress, eBay, MediaMarkt, Vanden Borre, Fnac, Decathlon, IKEA and Etsy. "Add to cart" can be switched on in Settings.
- **Shows the trade-off.** It reads the price (or the order total on a checkout page) and shows its value after 5, 10, 20 or 30 years at an adjustable yearly return (default 7%).
- **Asks why.** "Buy anyway" unlocks only after you pick a reason. The toolbar popup shows which reason you buy on most.
- **Three ways out:**
  - *Skip it*: the amount goes into your jar. If you've set your savings or broker link, "Move it now" opens it.
  - *Wait*: the item is parked for 24 hours to 7 days, and you get a reminder when the time is up.
  - *Buy anyway*: the original click goes through. You won't be asked again for the next 15 minutes in that tab, so a multi-step checkout isn't interrupted twice.
- **Any other shop.** Open it, click the Future Me toolbar button, choose "Watch this shop".
- **English and Dutch**, following the browser's language.
- **Private by design.** No account. Your purchases, jar and IBAN stay in the browser. Only anonymous totals (a random install code, shop domain, amounts) go to the Future Me counter, and users can switch that off in Settings.

## Install it (beta, 5 minutes)

Future Me is waiting for review in the Chrome Web Store and Edge Add-ons. Until then, install it by hand:

**[⬇ Download the latest version (future-me.zip)](https://github.com/JanVanCaneghem/futureme/releases/latest/download/future-me.zip)**

1. Unzip `future-me.zip` into a folder you'll keep, for example `Documents/future-me`. If you delete or move the folder, the add-on disappears.
2. In Chrome, go to `chrome://extensions`. In Edge, go to `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder, the one that contains `manifest.json`.
5. The settings page opens. Fill in your savings or broker link if you want the "Move it now" button.
6. Pin Future Me to the toolbar via the puzzle-piece icon.

Developer mode stays on, and Chrome may show a reminder about that at startup. Manual installs don't update themselves: to update, download the new zip, replace the folder's contents, and click the reload icon on Future Me in `chrome://extensions`.

## Publishing in the Chrome Web Store

1. Register a developer account at https://chrome.google.com/webstore/devconsole (one-time fee of US$5).
2. Upload `future-me.zip`.
3. Add at least one 1280×800 screenshot, a short and long description, and a privacy policy URL. `PRIVACY.md` is a starting point.
4. In the privacy section, declare the anonymous usage statistics (install code, shop domain, amounts) and that users can switch them off in Settings.
5. Justify each permission:
   - `storage`: settings, jar and history, stored locally.
   - `alarms` and `notifications`: the cooling-off reminder.
   - `activeTab` and `scripting`: add the shop the user is on when they click "Watch this shop".
   - Host access: only the listed shops, plus shops the user adds themselves.

Review usually takes a few days. The same zip can be submitted to the Microsoft Edge Add-ons store.

## Tuning price detection on a real shop

Shops change their pages often. If a price isn't picked up on a shop:

1. Open the browser console on that page (F12 → Console).
2. Run `localStorage.setItem('futureMeDebug','1')` and click the buy button again.
3. The console shows what Future Me detected.
4. Add the shop's price or total selector to `src/sites.js`.

When nothing is detected, the pause still appears, with an empty amount field the user can fill in.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | Extension definition (Manifest V3) |
| `src/content.js` | Detects buy clicks and shows the pause |
| `src/sites.js` | Shop selectors and button phrases (EN/NL/FR/DE) |
| `src/shared.js` | Settings, price parsing, money formatting |
| `src/background.js` | Reminders, notifications, added shops |
| `src/stats.js` | Anonymous stats to the Supabase counter |
| `supabase/migrations/` | Database tables and functions behind the counter |
| `popup/` | Toolbar popup: jar, stats, cooling-off list, this shop |
| `options/` | Settings page |
| `_locales/` | English and Dutch texts |

## Known limits

- **Firefox isn't supported yet.** It needs a small manifest change and testing.
- **Shop apps on phones aren't covered.** That needs a separate mobile approach.
- **Shops whose buy button has no text** (icon only, no label) aren't recognised by the generic rules. Add a selector for them in `sites.js`.
- **The return figure is an illustration, not a forecast.** The pause says so on every screen.
