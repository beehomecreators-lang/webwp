# Bee Home Creators WhatsApp Web Server

Unofficial WhatsApp Web automation server for the Bee Home Creators internal app.

## Render environment variables
- SUPABASE_URL = your Supabase project URL
- SUPABASE_ANON_KEY = your Supabase anon/public key
- CORS_ORIGIN = your Vercel app URL
- WWEBJS_AUTH_DIR = /data/.wwebjs_auth

Use a persistent disk mounted at `/data` so the WhatsApp Web login survives restarts.

The server uses `whatsapp-web.js` and WhatsApp Web. This is not the official WhatsApp Business API. Use only for legitimate, consent-based messaging and reasonable volumes; WhatsApp may restrict accounts that violate its terms or anti-spam rules.
