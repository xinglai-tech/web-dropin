require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Client, CheckoutAPI } = require('@adyen/api-library');
const { v4: uuid } = require('uuid');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
  },
}));

// ── Auth routes ──────────────────────────────────────────────────────────────
app.get('/login.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.AUTH_USERNAME &&
    await bcrypt.compare(password, process.env.AUTH_PASSWORD_HASH)
  ) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

// ── Auth middleware (protect everything below) ───────────────────────────────
app.use((req, res, next) => {
  // Allow static assets needed by login page
  if (req.path === '/style.css') return next();
  if (req.session && req.session.authenticated) return next();
  // API calls get 401, pages get redirected
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
    const { countryCode, currency, amount } = req.body;
    const response = await checkout.PaymentsApi.paymentMethods({
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      countryCode: countryCode || 'SG',
      amount: {
        currency: currency || 'SGD',
        value: amount || 1000,
      },
      channel: 'Web',
    });
    res.json(response);
  } catch (error) {
    console.error('/paymentMethods error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── /payments ───────────────────────────────────────────────────────────────
app.post('/api/payments', async (req, res) => {
  try {
    const { paymentMethod, browserInfo, currency, amount, countryCode, returnUrl } = req.body;
    const orderRef = uuid();

    const origin = `${req.protocol}://${req.get('host')}`;
    const finalReturnUrl =
      returnUrl || `${origin}/result.html`;

    const response = await checkout.PaymentsApi.payments({
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: {
        currency: currency || 'SGD',
        value: amount || 1000,
      },
      reference: orderRef,
      paymentMethod,
      browserInfo,
      returnUrl: finalReturnUrl,
      countryCode: countryCode || 'SG',
      channel: 'Web',
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
          amountIncludingTax: amount || 1000,
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
    });

    res.json(response);
  } catch (error) {
    console.error('/payments error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── /payments/details ───────────────────────────────────────────────────────
app.post('/api/payments/details', async (req, res) => {
  try {
    const response = await checkout.PaymentsApi.paymentsDetails({
      details: req.body.details,
    });
    res.json(response);
  } catch (error) {
    console.error('/payments/details error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
};
https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
});
