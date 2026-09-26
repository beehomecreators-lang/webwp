const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AUTH_DIR = process.env.WWEBJS_AUTH_DIR || '/data/.wwebjs_auth';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}
const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'missing');

let state = 'starting';
let qrDataUrl = null;
let lastError = null;
let clientReady = false;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }
});

client.on('qr', async (qr) => {
  state = 'qr'; clientReady = false; lastError = null;
  try { qrDataUrl = await QRCode.toDataURL(qr); } catch (e) { lastError = e.message; }
  console.log('WhatsApp QR generated');
});
client.on('authenticated', () => { state = 'authenticated'; qrDataUrl = null; console.log('WhatsApp authenticated'); });
client.on('ready', () => { state = 'ready'; clientReady = true; qrDataUrl = null; lastError = null; console.log('WhatsApp ready'); });
client.on('auth_failure', (msg) => { state = 'auth_failure'; clientReady = false; lastError = msg; console.error('Auth failure:', msg); });
client.on('disconnected', (reason) => { state = 'disconnected'; clientReady = false; lastError = String(reason); console.log('Disconnected:', reason); });
client.on('change_state', (s) => console.log('WhatsApp state:', s));

function normalizePhone(input) {
  let s = String(input || '').replace(/\D/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.length === 10) s = '91' + s;
  return s;
}

async function requireUser(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });
  const token = h.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = data.user;
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, whatsapp: state }));

app.get('/api/whatsapp/status', requireUser, async (req, res) => {
  res.json({ state, ready: clientReady, qr: qrDataUrl, error: lastError });
});

app.post('/api/whatsapp/reconnect', requireUser, async (req, res) => {
  try {
    await client.initialize();
    res.json({ ok: true, state });
  } catch (e) {
    lastError = e.message; state = 'error';
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/whatsapp/logout', requireUser, async (req, res) => {
  try {
    await client.logout();
    clientReady = false; state = 'logged_out'; qrDataUrl = null;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/whatsapp/send', requireUser, async (req, res) => {
  if (!clientReady) return res.status(503).json({ error: 'WhatsApp is not ready', state });
  const { phone, message, mediaUrl, filename } = req.body || {};
  if (!phone || (!message && !mediaUrl)) return res.status(400).json({ error: 'phone and message or mediaUrl are required' });
  const number = normalizePhone(phone);
  if (!number) return res.status(400).json({ error: 'Invalid phone number' });
  try {
    const chatId = `${number}@c.us`;
    const exists = await client.isRegisteredUser(chatId);
    if (!exists) return res.status(400).json({ error: 'This number is not registered on WhatsApp' });
    let sent;
    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      sent = await client.sendMessage(chatId, media, { caption: message || '', sendMediaAsDocument: false, filename });
    } else {
      sent = await client.sendMessage(chatId, String(message));
    }
    res.json({ ok: true, id: sent.id?._serialized || null, to: number });
  } catch (e) {
    lastError = e.message;
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp server listening on ${PORT}`);
  client.initialize().catch((e) => { lastError = e.message; state = 'error'; console.error(e); });
});
