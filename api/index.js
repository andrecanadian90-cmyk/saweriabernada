const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const app = express();

app.use(cors());
app.use(express.json());

// Otomatis membaca database KV milik Vercel Anda
let redisClient = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redisClient = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

// 1. WEBHOOK RECEIVER (Dari Saweria)
app.post('/api/saweria/webhook/:secretKey', async (req, res) => {
  const { secretKey } = req.params;
  const body = req.body;

  if (!redisClient) {
    return res.status(500).json({ 
      ok: false, 
      error: 'Vercel KV belum terhubung. Silakan buat & hubungkan database KV di dashboard Vercel.' 
    });
  }

  if (!body) {
    return res.status(400).json({ ok: false, error: 'Request body kosong' });
  }

  const newDonation = {
    id: body.id || crypto.randomUUID(),
    ts: Date.now(), 
    donor: body.donator_name || 'Anonymous',
    amount: Number(body.amount_raw) || 0,
    message: body.message || ''
  };

  const redisKey = `donations:${secretKey}`;
  
  try {
    let donationsList = await redisClient.get(redisKey) || [];
    if (typeof donationsList === 'string') {
      donationsList = JSON.parse(donationsList);
    }

    donationsList.unshift(newDonation);

    if (donationsList.length > 50) {
      donationsList = donationsList.slice(0, 50);
    }

    await redisClient.set(redisKey, JSON.stringify(donationsList));
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Database error: ' + error.message });
  }
});

// 2. POLLING API (Untuk Roblox)
app.get('/api/saweria/donations/:secretKey', async (req, res) => {
  const { secretKey } = req.params;
  const since = Number(req.query.since) || 0;

  if (!redisClient) {
    return res.status(500).json({ ok: false, error: 'Vercel KV belum terhubung.' });
  }

  const redisKey = `donations:${secretKey}`;

  try {
    let donationsList = await redisClient.get(redisKey) || [];
    if (typeof donationsList === 'string') {
      donationsList = JSON.parse(donationsList);
    }

    const newDonations = donationsList.filter(d => d.ts > since);
    return res.status(200).json({ ok: true, donations: newDonations });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

app.get('/', (req, res) => {
  res.send('Saweria Proxy Backend for Roblox is running on Vercel!');
});

module.exports = app;
