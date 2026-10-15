# Khalsa Akhara Wrestling Coventry — Website & Club System

The club's website plus a small zero-dependency Node backend — the public pages,
the membership form, automated welcome emails, and the admin dashboard.

## What's included

| Piece | What it does |
|---|---|
| `index.html`, `css/style.css`, `js/main.js` | The main one-pager (hero slider, about, shop teaser, media, contact) |
| `join.html`, `js/join.js` | **Membership form** — two-step wizard, posts to the backend |
| `shop.html` | Club shop — 11 products, orders placed through the official Bludog store |
| `rules.html` / `history.html` / `benefits.html` / `coaches.html` | About Us pages (shared `css/page.css`) |
| `server.js` | Zero-dependency Node server — serves the site, the API, and sends welcome emails |
| `admin.html`, `admin.css`, `admin.js` | The club dashboard: members, payments, prospects and messages |
| `docs/member-onboarding.html` | Print-ready New Wrestler Onboarding Pack — with a "Download PDF" button serving `docs/member-onboarding.pdf` |
| `docs/club-information.html` | Print-ready Club Information Pack |
| `data/club.db` | SQLite database (created automatically on first run) |
| `config.json` | Admin password hash + optional email key (created automatically; keep private) |

## How to run locally

```
node server.js
```

Then open **http://127.0.0.1:8000** — the site works, forms save to the database,
and the dashboard lives at **http://127.0.0.1:8000/admin**.

To stop the server, press `Ctrl+C` in its window.

### First-time login

Default admin password: **`KhalsaAkhara2026!`** (printed in the server console
the first time it runs). Change it any time:

```
node server.js --set-password <new-password>
```

### Opening the site on other devices (same Wi-Fi)

```
HOST=0.0.0.0 node server.js
```

then visit `http://<this-computer's-IP>:8000` from a phone or tablet.
(`PORT=9000 node server.js` changes the port.)

## Automated welcome emails (Resend)

When someone completes the membership form, the backend emails them a friendly
thank-you with the Onboarding Pack link and a GoCardless direct-debit
placeholder — plus an optional heads-up email to the club. Emails are sent
through **Resend** (free tier: resend.com) and are **silently skipped** until a
key is configured, so the form always works either way.

```
node server.js --set-email-key <resend-api-key>     # saves to config.json
```

or set environment variables instead (needed on Render):

| Variable | Meaning | Example |
|---|---|---|
| `RESEND_API_KEY` | Resend API key | `re_...` |
| `EMAIL_FROM` | Sender address | `Khalsa Akhara <onboarding@resend.dev>` |
| `SITE_URL` | Public site URL (used for links inside emails) | `https://your-app.onrender.com` |
| `GOCARDLESS_URL` | Direct-debit link — placeholder for now | `https://manage.gocardless.com` |
| `NOTIFY_EMAIL` | Optional club inbox for new sign-up alerts | `club@example.com` |

## Hosting temporarily on Render (free)

The repo is ready to deploy. Steps:

1. Create a free **GitHub** account, then a free **Render** account (render.com).
2. Push this folder to GitHub (see the git note below), then in Render choose
   **New + → Web Service → connect the repo** — or **New + → Blueprint** to use
   the included `render.yaml`.
3. In the service's **Environment** tab, set `ADMIN_PASSWORD` to a strong
   password, and `SITE_URL` to the URL Render gives you (e.g.
   `https://khalsa-akhara-wrestling.onrender.com`). Add `RESEND_API_KEY` when
   you have one. `TRUST_PROXY=1` and `HOST=0.0.0.0` are preset by the
   blueprint.
4. Share the `https://….onrender.com` link — the dashboard is at `/admin`.

Caveats of the free tier: the disk is **ephemeral** — the cloud copy of
`data/club.db` resets whenever Render redeploys, so **the local
`data/club.db` is the source of truth** (back it up regularly). Free services
also sleep after inactivity, so the first visit after a pause can take ~30s
to wake up.

## What the dashboard tracks

- **Members** — everyone who completes the membership form (under-16 branch
  keeps the guardian's contact details). Toggle Pending → Active, **Mark
  Paid** when the £30/month arrives, delete with confirmation.
- **Prospects** — people who asked for more information. Mark them Contacted,
  or **Convert →** to open the pre-filled membership form for them
  (`/join.html?name=…`).
- **Messages** — enquiries from the website contact form. Unread messages are
  highlighted.

Payments are recorded manually: the club marks a member as paid each month.
`Paid ✓` shows when the current month has been marked.

## Backups

Everything lives in **`data/club.db`** (SQLite). To back up, stop the server and
copy `data/club.db` (plus `club.db-wal` / `club.db-shm` if present). `config.json`
holds the admin password hash and email key — back it up too, and never share it.

## Notes

- Sessions log out when the server restarts (tokens are kept in memory).
- Regenerate the onboarding PDF after editing `docs/member-onboarding.html`:
  `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=10000 --print-to-pdf="C:\Users\User\Desktop\Khalsa Akhara Coventry\docs\member-onboarding.pdf" "file:///C:/Users/User/Desktop/Khalsa%20Akhara%20Coventry/docs/member-onboarding.html"`
- Public forms are rate-limited per IP and use a honeypot field against bots.
- The site needs the server running for forms, the dashboard and the media
  player to work; browsing the pages themselves also works by double-clicking
  `index.html` (forms will show a "could not reach the server" notice).
- `data/`, `config.json`, `tools/` and `node_modules/` are git-ignored — the
  database and credentials never leave this machine.
