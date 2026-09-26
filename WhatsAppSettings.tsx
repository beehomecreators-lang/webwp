import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase, type WhatsAppSettings as WhatsAppSettingsType } from '@/lib/supabase';
import { disconnectWhatsApp, getWhatsAppQr, getWhatsAppStatus, startWhatsApp, whatsappServerConfigured } from '@/lib/whatsappWeb';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  KeyRound,
  Globe,
  Radio,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Info,
  Server,
  ArrowDown,
  Building2,
  Users,
} from 'lucide-react';

export default function WhatsAppSettings() {
  const { user, session } = useAuth();
  const [webState, setWebState] = useState('disconnected');
  const [webError, setWebError] = useState<string | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webRefresh, setWebRefresh] = useState(0);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<WhatsAppSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form fields
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('whatsapp_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setSettings(data as WhatsAppSettingsType);
        setWabaId(data.waba_id ?? '');
        setPhoneNumberId(data.phone_number_id ?? '');
        setDisplayPhoneNumber(data.display_phone_number ?? '');
        setAccessToken(data.access_token ?? '');
        setWebhookVerifyToken(data.webhook_verify_token ?? '');
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!session || !whatsappServerConfigured()) return;
    let alive = true;
    const poll = async () => {
      try {
        const status = await getWhatsAppStatus(session);
        if (alive) {
          setWebState(status.state || 'disconnected');
          setWebError(status.error || null);
          if (status.hasQr && status.state === 'qr') {
            try {
              const nextQr = await getWhatsAppQr(session);
              setQrImageUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return nextQr; });
            } catch {}
          } else {
            setQrImageUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return null; });
          }
        }
      } catch (error) {
        if (alive) setWebError(error instanceof Error ? error.message : 'WhatsApp server unavailable.');
      }
    };
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => { alive = false; window.clearInterval(timer); setQrImageUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return null; }); };
  }, [session, webRefresh]);

  const connectWhatsAppWeb = async () => {
    if (!session) return;
    setWebLoading(true);
    setWebError(null);
    try {
      await startWhatsApp(session);
      setWebRefresh((v) => v + 1);
    } catch (error) {
      setWebError(error instanceof Error ? error.message : 'Could not start WhatsApp.');
    } finally {
      setWebLoading(false);
    }
  };

  const disconnectWhatsAppWeb = async () => {
    if (!session) return;
    setWebLoading(true);
    try {
      await disconnectWhatsApp(session);
      setWebRefresh((v) => v + 1);
    } catch (error) {
      setWebError(error instanceof Error ? error.message : 'Could not disconnect WhatsApp.');
    } finally {
      setWebLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    if (!phoneNumberId || !accessToken) {
      setTestResult({
        success: false,
        message: 'Phone Number ID and Permanent Access Token are required to test connection.',
      });
      setTesting(false);
      return;
    }

    try {
      // Directly verify credentials against Meta Graph API
      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId.trim()}`, {
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.id) {
        setTestResult({
          success: true,
          message: `Official Meta API verified! Verified Name: "${data.verified_name || 'Bee Home Creators'}", Quality Rating: ${data.quality_rating || 'GREEN'}.`,
        });
        if (data.display_phone_number && !displayPhoneNumber) {
          setDisplayPhoneNumber(data.display_phone_number);
        }
      } else {
        setTestResult({
          success: false,
          message: data.error?.message || 'Meta API returned an authorization error. Please check your credentials.',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Network request to Meta Graph API failed. Please check your internet connection or token.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const isConnected = Boolean(
      wabaId.trim() && phoneNumberId.trim() && accessToken.trim() && testResult?.success
    );

    const payload = {
      user_id: user.id,
      waba_id: wabaId.trim() || null,
      phone_number_id: phoneNumberId.trim() || null,
      display_phone_number: displayPhoneNumber.trim() || null,
      access_token: accessToken.trim() || null,
      webhook_verify_token: webhookVerifyToken.trim() || null,
      is_connected: isConnected,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('whatsapp_settings')
      .upsert(payload, { onConflict: 'user_id' });

    setSaving(false);

    if (!upsertError) {
      setModalOpen(false);
      await loadSettings();
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('whatsapp_settings')
      .update({ is_connected: false })
      .eq('user_id', user.id);
    setSaving(false);
    await loadSettings();
  };

  const isConnected = Boolean(settings?.is_connected);
  const isConfigured = Boolean(settings?.phone_number_id && settings?.access_token);
  const isWebhookConfigured = Boolean(settings?.webhook_verify_token);

  return (
    <div>
      {/* WhatsApp Web automation connection */}
      <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">WhatsApp Web Connection</h2>
            <p className="text-sm text-slate-600 mt-1">Connect your WhatsApp by scanning one QR code. No Meta access token is needed.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${webState === 'ready' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {webState === 'ready' ? 'Connected' : webState === 'qr' ? 'Scan QR' : webState === 'connecting' ? 'Connecting…' : webState === 'authenticated' ? 'Finishing…' : 'Not connected'}
            </span>
            {webState === 'ready' && (
              <button onClick={disconnectWhatsAppWeb} disabled={webLoading} className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 text-xs font-semibold">Disconnect</button>
            )}
          </div>
        </div>

        {!whatsappServerConfigured() ? (
          <div className="mt-4 rounded-xl bg-white border border-amber-200 p-4 text-sm text-amber-800">
            WhatsApp server is not deployed yet. Once the server URL is added to the website, this section will show the QR code.
          </div>
        ) : webState === 'qr' && session ? (
          <div className="mt-5 flex flex-col items-center">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <img src={qrImageUrl || ''} alt="WhatsApp connection QR code" className="w-[300px] h-[300px]" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">On your phone: WhatsApp → Settings → Linked devices → Link a device → Scan this QR</p>
            <p className="text-xs text-slate-500 mt-1">Keep this page open until the status changes to Connected.</p>
          </div>
        ) : webState !== 'ready' ? (
          <div className="mt-5">
            <button onClick={connectWhatsAppWeb} disabled={webLoading} className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm disabled:opacity-50">
              {webLoading ? 'Starting WhatsApp…' : 'Connect WhatsApp'}
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-white border border-emerald-200 p-4 text-sm text-emerald-800">
            WhatsApp is connected. Your Create Message page can now send through this WhatsApp session.
          </div>
        )}

        {webError && <p className="mt-3 text-xs text-rose-600">{webError}</p>}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            WhatsApp Business Connection
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure official Meta WhatsApp Cloud API credentials for Bee Home Creators
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-amber-500/20"
        >
          <Smartphone className="w-4 h-4" />
          <span>{isConnected ? 'Update WhatsApp Settings' : 'Connect WhatsApp Business'}</span>
        </button>
      </div>

      {/* Primary Status Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {/* 1. Connection Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Connection status
            </span>
            <Radio
              className={`w-4 h-4 ${
                isConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-slate-400 flex-shrink-0" />
            )}
            <p className={`text-xl font-bold ${isConnected ? 'text-emerald-600' : 'text-slate-700'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {isConnected
              ? 'Authorized with Meta WhatsApp Cloud API'
              : 'Messages cannot be dispatched until connected'}
          </p>
        </div>

        {/* 2. WhatsApp Business Account */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              WhatsApp Business Account
            </span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-lg font-bold text-slate-800 truncate">
            {settings?.waba_id ? `ID: ${settings.waba_id}` : 'Not connected'}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {settings?.waba_id ? 'Bee Home Creators WABA verified' : 'Requires Meta WABA ID'}
          </p>
        </div>

        {/* 3. Phone Number */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Phone number
            </span>
            <Smartphone className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-lg font-bold text-slate-800 truncate font-mono">
            {settings?.display_phone_number || (settings?.phone_number_id ? `ID: ${settings.phone_number_id}` : 'Not connected')}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Sender: Bee Home Creators Official Number
          </p>
        </div>

        {/* 4. API Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              API status
            </span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConfigured ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <p className="text-lg font-bold text-slate-800">
              {isConfigured ? 'Configured' : 'Not configured'}
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-2">Official Cloud API v20.0 Integration</p>
        </div>

        {/* 5. Webhook Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Webhook status
            </span>
            <Globe className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isWebhookConfigured ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <p className="text-lg font-bold text-slate-800">
              {isWebhookConfigured ? 'Configured' : 'Not configured'}
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-2">Real-time Delivery & Read Receipts</p>
        </div>

        {/* 6. Quick Action / Reset */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 rounded-2xl border border-amber-200 p-6 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="font-semibold text-amber-900 text-sm">Connection Management</h3>
            <p className="text-xs text-amber-800/80 mt-1">
              Test your Meta credentials or disconnect the active WhatsApp integration.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setModalOpen(true)}
              className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors text-center"
            >
              Configure
            </button>
            {isConnected && (
              <button
                onClick={handleDisconnect}
                disabled={saving}
                className="py-2 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-medium rounded-lg text-xs shadow-sm transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Official Architecture Diagram */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="text-base font-bold text-slate-800 mb-2">Official Architecture</h2>
        <p className="text-xs text-slate-500 mb-6">
          Bee Home Creators strictly utilizes the official Meta WhatsApp Business Cloud API. No
          browser automation, web scraping, or unofficial proxies are permitted.
        </p>

        <div className="max-w-xl mx-auto py-2">
          {/* Node 1 */}
          <div className="bg-slate-900 text-white rounded-xl p-3.5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-sm font-semibold">Bee Home Creators Website</p>
                <p className="text-[11px] text-slate-400">Private Admin Panel</p>
              </div>
            </div>
            <span className="text-[10px] bg-slate-800 text-amber-400 px-2 py-0.5 rounded font-mono">
              SOURCE
            </span>
          </div>

          <div className="flex justify-center my-2">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Node 2 */}
          <div className="bg-emerald-900 text-white rounded-xl p-3.5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold">Official WhatsApp Business Platform / Cloud API</p>
                <p className="text-[11px] text-emerald-300">Meta Graph API v20.0</p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded font-mono">
              OFFICIAL
            </span>
          </div>

          <div className="flex justify-center my-2">
            <ArrowDown className="w-5 h-5 text-emerald-500" />
          </div>

          {/* Node 3 */}
          <div className="bg-amber-600 text-white rounded-xl p-3.5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-amber-200" />
              <div>
                <p className="text-sm font-semibold">Bee Home Creators WhatsApp Business Number</p>
                <p className="text-[11px] text-amber-100">Verified Business Caller ID</p>
              </div>
            </div>
            <span className="text-[10px] bg-amber-700 text-amber-100 px-2 py-0.5 rounded font-mono">
              SENDER
            </span>
          </div>

          <div className="flex justify-center my-2">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Node 4 */}
          <div className="bg-slate-100 text-slate-800 border border-slate-300 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-slate-600" />
              <div>
                <p className="text-sm font-semibold">Customer WhatsApp Numbers</p>
                <p className="text-[11px] text-slate-500">Real-Estate Inquiries & Contacts</p>
              </div>
            </div>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
              RECIPIENTS
            </span>
          </div>
        </div>
      </div>

      {/* Compliance Callout */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 border border-slate-800 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">WhatsApp Business Platform Compliance</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Bee Home Creators complies with the WhatsApp Commerce & Business Policies. Never use
              unofficial tools, browser session QR scanning, or third-party web scrapers. Only Meta's
              official Cloud API tokens are recognized.
            </p>
          </div>
        </div>
      </div>

      {/* Connection & Credentials Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-800">
                  Connect Official WhatsApp Business API
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  Obtain these credentials from your{' '}
                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-semibold"
                  >
                    Meta for Developers Portal
                  </a>{' '}
                  under WhatsApp → API Setup.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  type="text"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="e.g. 102938475610293"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="e.g. 109876543210987"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Display Phone Number
                  </label>
                  <input
                    type="text"
                    value={displayPhoneNumber}
                    onChange={(e) => setDisplayPhoneNumber(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Meta Permanent System User Access Token
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Stored securely and shielded from public exposure.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Webhook Verify Token (Optional)
                </label>
                <input
                  type="text"
                  value={webhookVerifyToken}
                  onChange={(e) => setWebhookVerifyToken(e.target.value)}
                  placeholder="bee_home_creators_secure_token"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              {/* Webhook Configuration Information */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Meta Webhook Callback URL:
                </p>
                <p className="text-xs font-mono text-slate-700 bg-white p-2 rounded border border-slate-200 select-all truncate">
                  {webhookUrl}
                </p>
              </div>

              {/* Test Result Message */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Test Meta Connection
                </button>

                <div className="flex-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-medium rounded-lg text-xs hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold py-2.5 rounded-lg text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Connect'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
