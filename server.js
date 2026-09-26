import express from 'express';
import cors from 'cors';
import multer from 'multer';
import QRCode from 'qrcode';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 3001);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN, credentials: false }));
app.use(express.json({ limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const dataDir = path.resolve(process.env.WHATSAPP_DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });
const ownerFile = path.join(dataDir, 'owner.json');

let ownerUserId = null;
try {
  ownerUserId = JSON.parse(fs.readFileSync(ownerFile, 'utf8')).userId || null;
} catch {}

let client = null;
let qrData = null;
let state = 'disconnected';
let lastError = null;
let displayNumber = null;
let initializing = false;

async function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing login session.' });
  const token = auth.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return res.status(401).json({ error: 'Invalid login session.' });
  req.user = data.user;
  req.supabase = supabase;
  if (!ownerUserId) {
    ownerUserId = data.user.id;
    fs.writeFileSync(ownerFile, JSON.stringify({ userId: ownerUserId }, null, 2));
  }
  if (ownerUserId !== data.user.id) return res.status(403).json({ error: 'This WhatsApp connection belongs to another admin.' });
  next();
}

function setupClient(userId) {
  if (client || initializing) return;
  initializing = true;
  state = 'connecting';
  lastError = null;

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'bee-home-creators', dataPath: dataDir }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  });

  client.on('qr', (qr) => {
    qrData = qr;
    state = 'qr';
  });

  client.on('authenticated', () => {
    qrData = null;
    state = 'authenticated';
  });

  client.on('ready', () => {
    qrData = null;
    state = 'ready';
    try {
      const info = client.info;
      displayNumber = info?.wid?.user ? `+${info.wid.user}` : null;
    } catch {}
  });

  client.on('auth_failure', (msg) => {
    state = 'error';
    lastError = `WhatsApp authentication failed: ${msg}`;
  });

  client.on('disconnected', (reason) => {
    state = 'disconnected';
    lastError = `WhatsApp disconnected: ${reason}`;
    client = null;
    qrData = null;
    initializing = false;
  });

  client.on('change_state', (newState) => {
    if (newState === 'CONNECTED') state = 'ready';
  });

  client.initialize().catch((err) => {
    state = 'error';
    lastError = err?.message || String(err);
    client = null;
    initializing = false;
  });
}


app.get('/health', (_req, res) => res.json({ ok: true, service: 'bee-home-creators-whatsapp' }));

app.get('/api/whatsapp/status', authenticate, (_req, res) => {
  res.json({ state, ready: state === 'ready', hasQr: Boolean(qrData), displayNumber, error: lastError });
});

app.get('/api/whatsapp/qr', authenticate, async (_req, res) => {
  if (!qrData) return res.status(404).json({ error: 'QR code is not available. Start connection first.' });
  const png = await QRCode.toBuffer(qrData, { width: 360, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  res.send(png);
});

app.post('/api/whatsapp/connect', authenticate, (req, res) => {
  setupClient(req.user.id);
  res.json({ ok: true, state });
});

app.post('/api/whatsapp/disconnect', authenticate, async (_req, res) => {
  if (client) {
    try { await client.logout(); } catch {}
    try { await client.destroy(); } catch {}
  }
  client = null;
  qrData = null;
  state = 'disconnected';
  displayNumber = null;
  initializing = false;
  res.json({ ok: true });
});

function normalizeRecipient(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) throw new Error('Invalid WhatsApp number.');
  return `${digits}@c.us`;
}

app.post('/api/whatsapp/send', authenticate, upload.single('media'), async (req, res) => {
  if (!client || state !== 'ready') return res.status(409).json({ error: 'WhatsApp is not connected. Connect it first.' });

  const recipients = JSON.parse(req.body.recipients || '[]');
  const message = String(req.body.message || '').trim();
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'No recipients selected.' });
  if (!message && !req.file) return res.status(400).json({ error: 'Message or media is required.' });

  const results = [];
  let media = null;
  if (req.file) {
    media = new MessageMedia(req.file.mimetype, req.file.buffer.toString('base64'), req.file.originalname);
  }

  for (const recipient of recipients) {
    const number = recipient.number || recipient.whatsapp_number;
    const name = recipient.name || recipient.contact_name || null;
    try {
      const jid = normalizeRecipient(number);
      const numberId = await client.getNumberId(jid.replace('@c.us', ''));
      if (!numberId) throw new Error('This number is not registered on WhatsApp.');
      const sent = media
        ? await client.sendMessage(numberId._serialized, media, message ? { caption: message } : {})
        : await client.sendMessage(numberId._serialized, message);
      results.push({ number, name, ok: true, messageId: sent?.id?._serialized || null });
    } catch (error) {
      results.push({ number, name, ok: false, error: error?.message || String(error) });
    }
    // Small pacing delay to avoid firing a burst of messages at once.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  res.json({ ok: true, results });
});

app.listen(PORT, () => console.log(`Bee Home Creators WhatsApp server listening on ${PORT}`));
