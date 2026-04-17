# Adyen Advanced Flow Demo

A simple Node.js + Express webapp that demonstrates the **Adyen Advanced Flow** integration using:

- **Backend** – `@adyen/api-library` (Node.js)
- **Frontend** – Adyen Web Drop-in v6 (CDN)

## Features

- Card payments with native / redirect 3DS
- Redirect-based APMs (Klarna, Afterpay, iDEAL, etc.)
- Custom return URL after redirect → calls `/payments/details` to fetch final result
- Country & currency selector on homepage

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure `.env`**

   ```
   ADYEN_API_KEY=your_api_key
   ADYEN_MERCHANT_ACCOUNT=your_merchant_account
   ADYEN_CLIENT_KEY=test_xxx
   PORT=3000
   ```

3. **Run**

   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in a browser.

## Flow

1. **Homepage** – select country, currency, amount → click *Continue to Checkout*
2. **Checkout** – Adyen Drop-in renders available payment methods
3. **Pay** – card / APM → 3DS challenge handled in-page or via redirect
4. **Result** – after payment or redirect, final result shown on result page
