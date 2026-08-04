# Adyen Drop-in Test App

A Node.js + Express app for exercising the **Adyen Advanced Flow** against a
test merchant account. It renders Adyen Web Drop-in v6 and exposes the raw
request and response of every backend call, so you can see exactly what was
sent to Adyen.

- **Backend** — `@adyen/api-library`
- **Frontend** — Adyen Web Drop-in v6 (loaded from Adyen's CDN)

Test environment only. Use test credentials.

## Features

- Card payments with native or redirect 3DS
- Redirect APMs (Klarna, iDEAL, Afterpay, ...), QR and voucher methods
- Wallets (Apple Pay, Google Pay) — requires HTTPS, see below
- Stored payment methods, including removal
- Installments for MX / BR / JP
- Debug console showing backend API calls and Drop-in SDK events
- Test credentials panel for redirect APMs
- English / 中文 interface
- Shared access code gate in front of the whole app

## Requirements

- Node.js 18 or later
- An Adyen **test** account with an API credential

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create your `.env`**

   ```bash
   cp .env.example .env
   ```

   Then fill it in. Two values are generated rather than copied from the
   Customer Area:

   ```bash
   # ACCESS_CODE_HASH — bcrypt hash of the access code you want to use
   node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'your-access-code'

   # SESSION_SECRET — random string used to sign the session cookie
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Wrap `ACCESS_CODE_HASH` in single quotes: bcrypt hashes contain `$`.

3. **Run**

   ```bash
   npm start
   ```

4. Open `http://localhost:3000` and enter your access code.

## HTTPS (needed for Apple Pay and Google Pay)

The wallets refuse to initialise over plain HTTP. If `key.pem` and `cert.pem`
exist in the project root, the server starts over HTTPS automatically:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout key.pem -out cert.pem -subj "/CN=localhost"
```

Then open `https://localhost:3000` and accept the self-signed certificate
warning. Both files are gitignored.

Card payments and redirect APMs work fine over HTTP, so this step is optional
unless you are testing wallets.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ADYEN_API_KEY` | yes | API key from Customer Area → Developers → API credentials |
| `ADYEN_MERCHANT_ACCOUNT` | yes | Merchant account name |
| `ADYEN_CLIENT_KEY` | yes | Client key from the same screen |
| `ACCESS_CODE_HASH` | yes | bcrypt hash of the shared access code |
| `SESSION_SECRET` | yes | Signs the session cookie |
| `WEBHOOK_STATUS_URL` | no | Adds a webhook status link to the result screen |
| `PORT` | no | Defaults to `3000` |

You cannot log in while `ACCESS_CODE_HASH` or `SESSION_SECRET` is missing, so
set both before starting.

## Flow

1. **Home** — pick country, currency, amount and any test presets
2. **Checkout** — Drop-in renders the available payment methods
3. **Pay** — 3DS is handled in-page or via redirect, depending on the setting
4. **Result** — the final result code and PSP reference are shown

Open the debug console on the checkout page to inspect the request and
response of every backend call as it happens.

## Project layout

```
server.js          Express server, auth gate, and Adyen API routes
public/
  index.html       Configuration screen and test presets
  checkout.html    Drop-in host, debug console, test credentials panel
  result.html      Post-redirect result screen
  login.html       Access code gate
  i18n.js          English and Chinese strings
  style.css        Shared styles
logs/              Per-day payment request/response logs (gitignored)
```

## Notes

- Ten failed logins within a minute lock the client IP for another minute.
  While locked, even the correct code is rejected.
- Every payment call is written to `logs/payments-YYYY-MM-DD.log` with the full
  request and response. On Azure App Service these go to `/home/LogFiles`
  instead.
