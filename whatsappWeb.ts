import type { Session } from '@supabase/supabase-js';

const baseUrl = (import.meta.env.VITE_WHATSAPP_SERVER_URL as string | undefined)?.replace(/\/$/, '');

export function whatsappServerConfigured() {
  return Boolean(baseUrl);
}

async function request(session: Session, path: string, init: RequestInit = {}) {
  if (!baseUrl) throw new Error('WhatsApp server is not configured yet.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `WhatsApp server error (${response.status}).`);
  return data;
}

export async function getWhatsAppStatus(session: Session) {
  return request(session, '/api/whatsapp/status');
}

export async function startWhatsApp(session: Session) {
  return request(session, '/api/whatsapp/connect', { method: 'POST' });
}

export async function disconnectWhatsApp(session: Session) {
  return request(session, '/api/whatsapp/disconnect', { method: 'POST' });
}

export async function getWhatsAppQr(session: Session) {
  if (!baseUrl) throw new Error('WhatsApp server is not configured yet.');
  const response = await fetch(`${baseUrl}/api/whatsapp/qr`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error('QR code is not available yet.');
  return URL.createObjectURL(await response.blob());
}

export async function sendWhatsApp(
  session: Session,
  recipients: Array<{ number: string; name?: string | null }>,
  message: string,
  mediaFile?: File | null,
) {
  const form = new FormData();
  form.append('recipients', JSON.stringify(recipients));
  form.append('message', message);
  if (mediaFile) form.append('media', mediaFile);
  return request(session, '/api/whatsapp/send', { method: 'POST', body: form });
}
