# Simplest way to run the WhatsApp connector on the same Windows PC

This avoids Meta and avoids paying for a separate server. The WhatsApp connector runs on this PC and the existing Vercel website calls `http://localhost:3001`.

## One-time setup

1. Install Node.js 20+ LTS.
2. Open this project folder.
3. Open `start-whatsapp-windows.bat` in Notepad.
4. Replace `PASTE_YOUR_SUPABASE_ANON_KEY` with the same `VITE_SUPABASE_ANON_KEY` from the existing project's `.env`.
5. Save the file.
6. Double-click `start-whatsapp-windows.bat`.
7. Keep the black server window open whenever you want WhatsApp sending to work.
8. Open the website -> WhatsApp Settings -> Connect WhatsApp.
9. Scan the QR with WhatsApp -> Settings -> Linked Devices -> Link a device.
10. Once it says Connected, Create Message -> select one test contact -> Send.

The session is saved in `data`, so you normally will not need to scan the QR every time.
