require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { Client, CheckoutAPI } = require('@adyen/api-library');
const { v4: uuid } = require('uuid');
const path = require('path');

// ── Payment logger ──────────────────────────────────────────────────────────
const LOG_DIR = fs.existsSync('/home/LogFiles') ? '/home/LogFiles' : path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logPayment(endpoint, request, response) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      endpoint,
      request,
      response,
    };
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(LOG_DIR, `payments-${date}.log`);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    console.log(`[LOG] Written to ${file}`);
  } catch (err) {
    console.error('[LOG] Failed to write:', err.message);
  }
}

const app = express();
app.set('trust proxy', true);

// ── Security headers (applied to every response) ─────────────────────────────
// Content-Security-Policy is scoped to work with the Adyen Drop-in/Components:
//  - script/style/connect/img/font: self + Adyen checkoutshopper domains.
//  - frame-src & form-action allow any https origin because 3DS challenge
//    iframes and redirect payment methods target unpredictable issuer/bank URLs.
//  - 'unsafe-inline'/'unsafe-eval' are required by the inline page scripts and
//    the Adyen SDK.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.adyen.com https://pay.google.com https://applepay.cdn-apple.com",
  "style-src 'self' 'unsafe-inline' https://*.adyen.com",
  "img-src 'self' data: blob: https://*.adyen.com https://*.gstatic.com https://*.google.com",
  "font-src 'self' data: https://*.adyen.com https://applepay.cdn-apple.com",
  "connect-src 'self' https://*.adyen.com https://google.com https://*.google.com",
  "frame-src 'self' https:",
  "frame-ancestors 'self'",
  "form-action 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Auth helpers ─────────────────────────────────────────────────────────────
const AUTH_COOKIE = 'auth_token';
const FOUR_HOURS = 4 * 60 * 60 * 1000;

function makeToken() {
  const expires = Date.now() + FOUR_HOURS;
  const data = `authenticated:${expires}`;
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(data).digest('hex');
  return `${data}:${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [label, expires, sig] = parts;
  const data = `${label}:${expires}`;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(data).digest('hex');
  if (sig !== expected) return false;
  if (Date.now() > parseInt(expires, 10)) return false;
  return true;
}

// ── Auth routes ──────────────────────────────────────────────────────────────
app.get('/login.html', (req, res) => {
  if (verifyToken(req.cookies[AUTH_COOKIE])) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Login throttling (per client IP) ─────────────────────────────────────────
//  - Failures are counted within a rolling 1-minute window.
//  - Reaching LOGIN_FAIL_THRESHOLD failures locks the IP for LOCK_DURATION_MS,
//    measured from the moment of locking (NOT from the first failure).
//  - While locked, EVERY attempt is rejected — including the correct code —
//    until the lock expires, and the login page reveals the client IP.
const LOGIN_WINDOW_MS = 60 * 1000;    // window for counting failures
const LOGIN_FAIL_THRESHOLD = 10;      // failures that trigger a lock
const LOCK_DURATION_MS = 60 * 1000;   // how long the lock lasts, from lock time
const loginState = new Map(); // ip -> { count, windowTs, lockedUntil }

// Normalize the client IP for use as a throttling key. Azure's X-Forwarded-For
// header appends the client port (e.g. "1.2.3.4:56789"); the port changes per
// connection, so it must be stripped or each connection would get its own
// counter. Also unwraps bracketed IPv6 and the IPv4-mapped IPv6 prefix.
function clientIp(req) {
  let ip = req.ip || '';
  const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/); // IPv4 with :port
  if (v4) return v4[1];
  const v6 = ip.match(/^\[(.+)\]:\d+$/); // [IPv6]:port
  if (v6) ip = v6[1];
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4-mapped IPv6
  return ip;
}

function getLoginState(ip) {
  let s = loginState.get(ip);
  if (!s) {
    s = { count: 0, windowTs: Date.now(), lockedUntil: 0 };
    loginState.set(ip, s);
  }
  return s;
}

// Public: return the caller's IP (used by the login page to display it).
app.get('/whoami', (req, res) => {
  res.json({ ip: clientIp(req) });
});

app.post('/auth/login', async (req, res) => {
  const now = Date.now();
  const ip = clientIp(req);
  const s = getLoginState(ip);
  console.log(`[LOGIN] pid=${process.pid} ip=${ip} failures=${s.count} locked=${now < s.lockedUntil}`);

  // Currently locked → reject everything, including the correct code.
  if (now < s.lockedUntil) {
    return res.redirect('/login.html?error=locked&showip=1');
  }

  // Reset the failure counter once the counting window has elapsed.
  if (now - s.windowTs > LOGIN_WINDOW_MS) {
    s.count = 0;
    s.windowTs = now;
  }

  const { code } = req.body;
  const ok = code && await bcrypt.compare(code, process.env.ACCESS_CODE_HASH || '');
  if (ok) {
    loginState.delete(ip); // clear state on success
    res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${FOUR_HOURS / 1000}`);
    return res.redirect('/');
  }

  s.count += 1;
  if (s.count >= LOGIN_FAIL_THRESHOLD) {
    s.lockedUntil = now + LOCK_DURATION_MS; // start the lock
    return res.redirect('/login.html?error=locked&showip=1');
  }
  res.redirect('/login.html?error=1');
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.redirect('/login.html');
});

// ── Auth middleware (protect everything below) ───────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/style.css' || req.path === '/i18n.js' || req.path === '/favicon.svg') return next();
  if (verifyToken(req.cookies[AUTH_COOKIE])) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Adyen client ────────────────────────────────────────────────────────────
const client = new Client({
  apiKey: process.env.ADYEN_API_KEY,
  environment: process.env.ADYEN_ENVIRONMENT || 'TEST',
  liveEndpointUrlPrefix: process.env.ADYEN_LIVE_URL_PREFIX,
});
const checkout = new CheckoutAPI(client);

// ── Expose client key to frontend ───────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    clientKey: process.env.ADYEN_CLIENT_KEY,
    environment: (process.env.ADYEN_ENVIRONMENT || 'TEST').toLowerCase(),
    webhookStatusUrl: process.env.WEBHOOK_STATUS_URL || '',
  });
});

// ── /paymentMethods ─────────────────────────────────────────────────────────
app.post('/api/paymentMethods', async (req, res) => {
  try {
    const { countryCode, currency, amount, channel, shopperRef, telephoneNumber } = req.body;
    const ch = channel || 'Web';

    const pmRequest = {
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      countryCode: countryCode || 'SG',
      amount: {
        currency: currency || 'SGD',
        value: amount || 10,
      },
      channel: ch,
      ...(shopperRef && { shopperReference: shopperRef }),
      ...(telephoneNumber && { telephoneNumber }),
    };
    const response = await checkout.PaymentsApi.paymentMethods(pmRequest);
    logPayment('/paymentMethods', pmRequest, response);
    res.json(response);
  } catch (error) {
    console.error('/paymentMethods error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── /payments ───────────────────────────────────────────────────────────────
app.post('/api/payments', async (req, res) => {
  try {
    const { paymentMethod, browserInfo, currency, amount, countryCode, returnUrl, channel, merchantRef, shopperRef, storePaymentMethod, shopperInteraction, recurringModel, threeDSMode, telephoneNumber, shopperEmail, billingAddress, deliveryAddress, installments } = req.body;
    const orderRef = merchantRef || uuid();

    const origin = `${req.protocol}://${req.get('host')}`;
    const finalReturnUrl =
      returnUrl || `${origin}/result.html`;

    // Default address used to fill in fields the frontend does not supply.
    // Some countries (US, CA, ...) require a valid stateOrProvince, so we
    // provide country-aware defaults.
    const cc = countryCode || 'SG';
    const ADDRESS_DEFAULTS = {
      US: { street: '1 Test Street', houseNumberOrName: '1', city: 'New York', postalCode: '10001', stateOrProvince: 'NY', country: 'US' },
      CA: { street: '1 Test Street', houseNumberOrName: '1', city: 'Toronto', postalCode: 'M5H 2N2', stateOrProvince: 'ON', country: 'CA' },
      AU: { street: '1 Test Street', houseNumberOrName: '1', city: 'Sydney', postalCode: '2000', stateOrProvince: 'NSW', country: 'AU' },
    };
    const defaultAddress = ADDRESS_DEFAULTS[cc] || {
      street: '1 Test Street',
      houseNumberOrName: '1',
      city: 'Singapore',
      postalCode: '123456',
      stateOrProvince: 'N/A',
      country: cc,
    };
    // Merge frontend-provided address over the default, ignoring empty values,
    // so missing fields (e.g. stateOrProvince) always fall back to the default.
    const mergeAddress = (provided) => ({
      ...defaultAddress,
      ...Object.fromEntries(
        Object.entries(provided || {}).filter(([, v]) => v !== '' && v != null)
      ),
    });

    const payRequest = {
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: {
        currency: currency || 'SGD',
        value: amount || 10,
      },
      reference: orderRef,
      paymentMethod,
      browserInfo,
      returnUrl: finalReturnUrl,
      countryCode: countryCode || 'SG',
      channel: channel || 'Web',
      origin,
      shopperInteraction: shopperInteraction || 'Ecommerce',
      ...(threeDSMode !== 'redirect' && {
        authenticationData: {
          threeDSRequestData: {
            nativeThreeDS: 'preferred',
          },
        },
      }),
      // Required by Klarna / Afterpay / similar
      lineItems: [
        {
          quantity: 1,
          amountIncludingTax: amount || 10,
          description: 'Test Product',
          id: 'item-1',
          taxAmount: 0,
          taxPercentage: 0,
        },
      ],
      ...(shopperEmail && { shopperEmail }),
      shopperName: {
        firstName: 'Test',
        lastName: 'Shopper',
      },
      ...(telephoneNumber && { telephoneNumber }),
      ...(shopperRef && { shopperReference: shopperRef }),
      recurringProcessingModel: recurringModel || (paymentMethod?.storedPaymentMethodId ? 'CardOnFile' : undefined),
      ...(storePaymentMethod && { storePaymentMethod: true }),
      ...(installments && { installments }),
      billingAddress: mergeAddress(billingAddress),
      deliveryAddress: mergeAddress(deliveryAddress),
      shopperIP: clientIp(req),
      applicationInfo: {
        merchantApplication: { name: 'Web Dropin test app', version: '1.0.0' },
      },
    };
    const response = await checkout.PaymentsApi.payments(payRequest);
    logPayment('/payments', payRequest, response);
    res.json(response);
  } catch (error) {
    console.error('/payments error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── /payments/details ───────────────────────────────────────────────────────
app.post('/api/payments/details', async (req, res) => {
  try {
    const detailsReq = { details: req.body.details };
    const response = await checkout.PaymentsApi.paymentsDetails(detailsReq);
    logPayment('/payments/details', detailsReq, response);
    res.json(response);
  } catch (error) {
    console.error('/payments/details error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── /storedPaymentMethods/:id (delete token) ────────────────────────────────
app.delete('/api/storedPaymentMethods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { shopperRef } = req.body;
    await checkout.RecurringApi.deleteTokenForStoredPaymentDetails(
      id,
      shopperRef || 'user_shanghai',
      process.env.ADYEN_MERCHANT_ACCOUNT,
    );
    logPayment('/storedPaymentMethods/delete', { id, shopperRef }, { success: true });
    res.json({ success: true });
  } catch (error) {
    console.error('/storedPaymentMethods delete error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app)
    .listen(PORT, () => console.log(`Server running on https://localhost:${PORT}`));
} else {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
