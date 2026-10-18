# Future Me privacy policy

Effective 18 October 2026. The published version lives at https://futureme-fcaa6f.webflow.io/privacy.

**The short version:** your purchases, your jar and your bank details stay in your browser. The only thing that leaves it is a handful of anonymous totals that power the live counter on the Future Me website, and you can switch that off with one toggle.

## Who we are

Future Me is a free browser add-on for Chrome and Edge, made by Jan Van Caneghem (Waai Design, Belgium). For anything about privacy, email jan@waai.design.

## What stays on your device

Future Me keeps these in your browser's own extension storage. We never receive them:

- Your jar total, the purchases you skipped or parked, and the reasons you picked for buying anyway.
- Your settings: return rate, time horizon, reminder period, shops you added or switched off.
- The savings or broker link, account holder name and IBAN you enter for the transfer QR code.

Settings, including that name and IBAN, are kept in the browser's synced storage. If you have Chrome or Edge sync switched on, your browser copies them to your other devices through your Google or Microsoft account, under their privacy terms. Future Me itself doesn't receive them.

QR codes are generated on your device. When you scan one, the transfer happens in your own banking app. We don't connect to your bank, move money or see your balance.

## What we read on shop pages

On the shops Future Me supports, and on shops you add yourself, the add-on reads the price or order total when you click a buy or checkout button, so it can show the pause. It doesn't read or store product names, your basket contents, your address or anything you type.

## What we send: anonymous totals

To power the live counter, Future Me sends a few small events. Each one carries a random install code that is created on your device and isn't linked to your name, email or account.

- **Install check-in** (once a day): the install code, the add-on version and browser family (Chrome, Edge, Opera).
- **Purchase skipped**: the amount, the currency and the shop's domain, for example amazon.com.be.
- **QR code shown**: the amount.
- **Transfer**: the amount, and whether you confirmed the transfer went through.

We never send what you were buying, page addresses, your name, your IBAN, your browsing history or anything you type. The counter only ever shows totals across all users.

## Switching it off

Anonymous stats are on by default because they keep the public numbers honest. Open the add-on's Settings and switch off **Share anonymous stats**. Nothing more is sent from that moment, and any events still waiting to be sent are deleted. The add-on works exactly the same either way.

## Where it's stored and for how long

The anonymous events are stored in a database run by Supabase, in its London (United Kingdom) region. The UK is covered by an EU adequacy decision for data transfers. The database refuses all direct reads and writes; the add-on can only add events, and the website can only fetch the totals.

We keep the events for as long as the counter runs, so the totals stay accurate. Like any web service, our hosting provider handles your IP address when an event arrives and may keep it briefly in technical logs; we don't store it in the database.

## Legal basis and your rights

We process these anonymous totals on the basis of our legitimate interest in showing honest, aggregate results, balanced by keeping the data minimal and giving you an off switch. Under the GDPR you can ask for access to or deletion of your data, or object to processing. Because the events aren't linked to you, email us and we'll work out together how to find and remove them. You can also complain to the Belgian Data Protection Authority (gegevensbeschermingsautoriteit.be).

## The website

The Future Me website is hosted by Webflow. It loads fonts from Google Fonts and fetches the live totals from our database; neither request includes anything about you beyond what any web request does. We don't use advertising or tracking cookies.

## Permissions the add-on asks for

- **Storage**: your settings, jar and history, kept in your browser.
- **Alarms and notifications**: the reminder when a parked purchase's waiting time is up.
- **Active tab and scripting**: only used when you click "Watch this shop" to add the shop you're on.
- **Site access**: only the supported shops, plus shops you add yourself.

## Not financial advice

The future values Future Me shows are illustrations based on a yearly return you can adjust. They are not investment advice, and past returns don't guarantee future ones.

## Changes

If what Future Me collects changes, we'll update this policy and the date at the top before the new version ships.
