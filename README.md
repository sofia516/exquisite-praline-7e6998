# Ledgerly

Ledgerly is a responsive, offline-capable personal loan and repayment tracker. It has no build step or third-party runtime dependencies.

## Run locally

For a quick preview, open `index.html`. To try the installable/offline PWA behavior, serve the folder from localhost (service workers require HTTPS or localhost). For example, with Python installed:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

The included `netlify.toml` sets the publish directory and baseline security headers. Connect this folder/repository to Netlify or deploy it through the Netlify CLI. Use a custom domain with HTTPS; Netlify provides TLS for deployed sites. There is no build command, database, or secret to configure for this local-first version.

For each release, update `CACHE_NAME` in `service-worker.js` so installed copies receive the new shell assets.

## Features

- Track money lent and borrowed in INR, USD, EUR, or GBP; totals remain separated by currency
- Record partial and full payments, due dates, monthly EMIs, and notes
- Review balances, progress, upcoming payments, and payment history
- Search, filter, edit, and delete loan records
- Draft friendly reminders for copying or the device share sheet
- Export and validate/import a versioned JSON backup
- Responsive desktop/mobile layout, installable PWA shell, and offline app shell

## Data and launch scope

Loan data is saved in this browser's local storage. It stays on the device and is not sent to a server, but local storage is not encrypted. Anyone with access to the same browser profile may be able to read it. Clearing browser data removes the records, so keep an exported backup. Reminders are drafted locally and are not sent automatically.

This release is a single-device personal tracker. It has no account system, cloud sync, automated notification service, or financial institution integration. Public multi-user or cross-device launch would require a backend, authentication, encrypted transport/storage, backups, monitoring, and a privacy policy appropriate to the intended jurisdictions. Do not describe this version as bank-connected or as sending reminders automatically.
