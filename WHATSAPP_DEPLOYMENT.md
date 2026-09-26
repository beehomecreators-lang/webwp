# Bee Home Creators - WhatsApp Web automation

This adds an unofficial WhatsApp Web connection to the existing admin app. It uses a QR login and a persistent Node.js process.

## Architecture

Vercel website -> this Node server -> WhatsApp Web session -> customer

## Backend environment variables

- `SUPABASE_URL` = `https://lereltbxhekaqhirkpys.supabase.co`
- `SUPABASE_ANON_KEY` = same anon key already used by the website
- `FRONTEND_ORIGIN` = your Vercel website URL
- `WHATSAPP_DATA_DIR` = `/app/data`
- `PORT` = `3001`

The WhatsApp server must have a persistent disk/volume mounted at `/app/data`, otherwise the QR session will be lost when the service restarts.

## Website environment variable

Add to Vercel:

`VITE_WHATSAPP_SERVER_URL=https://YOUR-WHATSAPP-SERVER-DOMAIN`

Then redeploy the frontend.

## First connection

1. Open the Bee Home Creators app.
2. Open WhatsApp Settings.
3. Click Connect WhatsApp.
4. Scan the QR with WhatsApp -> Settings -> Linked Devices -> Link a device.
5. Wait for Connected.
6. Go to Create Message and send a test message to one number you control.

## Safety

This is an unofficial WhatsApp Web automation method. It is not the official WhatsApp Business Platform. WhatsApp can restrict accounts using unauthorized automation. Use it only with contacts and messaging practices permitted by WhatsApp and keep volumes reasonable.
