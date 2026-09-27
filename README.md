# Lismandy Office

The web version of the **LISMANDY AUTOMATED INVOICE** Excel workbook: invoices, proformas, receipts, customer statements, transactions ledger, cash book, price lists, customers, suppliers, trends & forecast, data-health checks and an admin portal with per-user access and two-step sign-in.

**Live site:** https://roscoebenjamins.github.io/lismandy-office/
**Demo (sample data, stays in your browser):** https://roscoebenjamins.github.io/lismandy-office/#demo

## How it fits together

```
 Browser (GitHub Pages)            Google Apps Script (fafale17)           Google Drive (fafale17)
 index.html  ── HTTPS POST ──▶  "Lismandy API" web app  ── reads/writes ──▶  LISMANDY DB / Lismandy Database (Sheets)
                                     │                                          └── Backups/ (nightly copy, last 30 kept)
                                     └── HTTPS POST + secret ──▶ "Lismandy Mailer" (lismandyenterprise@gmail.com) ──▶ Gmail
```

* **Front end** – React + Tailwind, bundled into one `index.html`. Holds no data and no secrets.
* **API / database** – Apps Script bound to the *Lismandy Database* spreadsheet in the `LISMANDY DB` folder. One tab per table (`invoices`, `receipts`, `customers`, …). `users`, `settings`, `audit` and `emails` tabs are hidden.
* **Mailer** – a tiny Apps Script that runs inside the **lismandyenterprise@gmail.com** account, so every invoice, receipt and statement is sent from that address (never from fafale17). It only accepts calls carrying the shared secret.
* **Business rules** live in `core/core.js` and run identically in the API, the browser demo and the tests.

## Security

* Passwords are salted and hashed (iterated SHA-256); 5 wrong tries lock the account for 15 minutes.
* **Two-step verification** with Google Authenticator or Microsoft Authenticator (standard TOTP, 6 digits, 30 s). Required for everyone by default; 8 single-use recovery codes are issued at enrolment.
* New users get a temporary password and must change it and link an authenticator at first sign-in.
* Every call except sign-in needs a session token (6-hour sliding expiry). Permissions are checked on the server for every action.
* Roles: Administrator, Manager, Accounts, Sales, Viewer — each area can be raised/lowered per person (No access / View / Create & edit / Full).
* Every change is written to the activity log (Admin portal → Activity log).

## Deploying / updating the API (Apps Script)

1. Open **LISMANDY DB → Lismandy Database** in Google Drive (signed in as fafale17).
2. **Extensions → Apps Script**. Replace `Code.gs` with `backend/Code.gs` from this repo. On first install only, also add `Seed.gs` (kept privately — it holds the Excel import).
3. Project Settings → tick *Show appsscript.json* and paste `backend/appsscript.json`.
4. Run `setup` once (approve permissions). The log shows the admin's **temporary password**.
5. **Deploy → New deployment → Web app** · Execute as **Me** · Who has access **Anyone**. Put the `/exec` URL in **`config.json`** at the top of this repo (`{ "apiUrl": "https://script.google.com/macros/s/…/exec" }`) — no rebuild needed. An empty `apiUrl` keeps the site in demo mode.
6. For later code changes: paste the new `Code.gs`, then **Deploy → Manage deployments → Edit → New version** (the URL stays the same).

## Connecting the Lismandy mailbox

1. Signed in as **lismandyenterprise@gmail.com**, create a new project at script.google.com and paste `mailer/Mailer.gs`.
2. Run `setupMailer` (approve Gmail) and copy the secret from the log.
3. Deploy as a Web app · Execute as **Me** · Access **Anyone**.
4. In the site: **Admin portal → Settings → Email**, paste the URL and secret, save, press **Send test**.

Gmail allows about 100 recipients a day from a free account.

## Building the front end

```bash
cd app && pnpm install
# single-file build → ../index.html
npx parcel build index.html --dist-dir dist --no-source-maps && npx html-inline dist/index.html > ../index.html
```

## Tests

`node tests/core.test.mjs` (business rules, TOTP against RFC 6238 vectors, permissions, allocation, statements, health checks) and `node tests/gas_sim.test.mjs` (runs the real `Code.gs` inside a simulated Apps Script runtime). Both need the private `backend/seed.json`.
