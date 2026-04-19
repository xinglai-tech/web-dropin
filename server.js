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
  const entry = {
    timestamp: new Date().toISOString(),
    endpoint,
    request,
    response,
  };
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `payments-${date}.log`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

const app = express();
app.set('trust proxy', true);
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

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.AUTH_USERNAME &&
    await bcrypt.compare(password, process.env.AUTH_PASSWORD_HASH)
  ) {
    res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${FOUR_HOURS / 1000}`);
    return res.redirect('/');
  }
  res.redirect('/login.html?error=1');
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.redirect('/login.html');
});

// ── Auth middleware (protect everything below) ───────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/style.css') return next();
  if (verifyToken(req.cookies[AUTH_COOKIE])) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Adyen client ────────────────────────────────────────────────────────────
const client = new Client({
  apiKey: process.env.ADYEN_API_KEY,
  environment: 'LIVE',
  liveEndpointUrlPrefix: process.env.ADYEN_LIVE_URL_PREFIX,
});
const checkout = new CheckoutAPI(client);

// ── Expose client key to frontend ───────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    clientKey: process.env.ADYEN_CLIENT_KEY,
    environment: 'live',
  });
});

// ── /paymentMethods ─────────────────────────────────────────────────────────
app.post('/api/paymentMethods', async (req, res) => {
  try {
    const { countryCode, currency, amount, channel } = req.body;
    const ch = channel || 'Web';
    const isMobile = ch === 'iOS' || ch === 'Android';
    const blockedPaymentMethods = isMobile
      ? ['wechatpayQR', 'wechatpayMiniProgram']
      : ['wechatpayMiniProgram'];

    const pmRequest = {
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      countryCode: countryCode || 'SG',
      amount: {
        currency: currency || 'SGD',
        value: amount || 10,
      },
      channel: ch,
      blockedPaymentMethods,
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
    const { paymentMethod, browserInfo, currency, amount, countryCode, returnUrl, channel } = req.body;
    if (amount > 5000) {
      return res.status(400).json({ error: 'Amount exceeds maximum limit of 5000' });
    }
    const orderRef = uuid();

    const origin = `${req.protocol}://${req.get('host')}`;
    const finalReturnUrl =
      returnUrl || `${origin}/result.html`;

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
      shopperInteraction: 'Ecommerce',
      authenticationData: {
        threeDSRequestData: {
          nativeThreeDS: 'preferred',
        },
      },
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
      shopperEmail: 'test@example.com',
      shopperName: {
        firstName: 'Test',
        lastName: 'Shopper',
      },
      shopperReference: 'shopper_' + Date.now(),
      billingAddress: {
        street: '1 Test Street',
        houseNumberOrName: '1',
        city: 'Singapore',
        postalCode: '123456',
        stateOrProvince: 'N/A',
        country: countryCode || 'SG',
      },
      deliveryAddress: {
        street: '1 Test Street',
        houseNumberOrName: '1',
        city: 'Singapore',
        postalCode: '123456',
        stateOrProvince: 'N/A',
        country: countryCode || 'SG',
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
