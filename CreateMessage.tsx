import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getWhatsAppStatus, sendWhatsApp, whatsappServerConfigured } from '@/lib/whatsappWeb';
import { supabase, type Contact } from '@/lib/supabase';
import { logActivity } from '@/lib/activities';
import { formatPhoneDisplay } from '@/lib/phone';
import {
  Search,
  CheckSquare,
  Square,
  Send,
  Image as ImageIcon,
  Video,
  X,
  Loader2,
  AlertCircle,
  Upload,
  User,
  ExternalLink,
} from 'lucide-react';

type MediaType = 'image' | 'video' | null;

type Props = {
  onNavigateToSettings?: () => void;
  onNavigateToHistory?: () => void;
};

export default function CreateMessage({ onNavigateToSettings, onNavigateToHistory }: Props) {
  const { user, session } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaName, setMediaName] = useState<string>('');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState(false);
  const [showNotConnectedModal, setShowNotConnectedModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const contactsRes = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setContacts((contactsRes.data ?? []) as Contact[]);
    if (session && whatsappServerConfigured()) {
      try {
        const status = await getWhatsAppStatus(session);
        setIsWhatsAppConnected(Boolean(status.ready));
      } catch {
        setIsWhatsAppConnected(false);
      }
    } else {
      setIsWhatsAppConnected(false);
    }
    setLoading(false);
  }, [user, session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const displayName = c.name && c.name.trim() ? c.name.toLowerCase() : 'unnamed contact';
    return displayName.includes(q) || c.whatsapp_number.toLowerCase().includes(q);
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaError(null);

    // Validate type and size
    if (type === 'image') {
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validImageTypes.includes(file.type)) {
        setMediaError('Invalid image format. Supported formats: JPG, JPEG, PNG, WEBP.');
        e.target.value = '';
        return;
      }
      // 5 MB max
      if (file.size > 5 * 1024 * 1024) {
        setMediaError('Image size exceeds 5MB limit. Please upload a smaller image.');
        e.target.value = '';
        return;
      }
    } else if (type === 'video') {
      const validVideoTypes = ['video/mp4'];
      if (!validVideoTypes.includes(file.type)) {
        setMediaError('Invalid video format. Supported format: MP4.');
        e.target.value = '';
        return;
      }
      // 16 MB max (WhatsApp API requirement)
      if (file.size > 16 * 1024 * 1024) {
        setMediaError('Video size exceeds 16MB limit. Please upload a shorter video.');
        e.target.value = '';
        return;
      }
    }

    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    const url = URL.createObjectURL(file);
    setMediaType(type);
    setMediaPreview(url);
    setMediaFile(file);
    setMediaName(file.name);
    e.target.value = '';
  };

  const removeMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaType(null);
    setMediaPreview(null);
    setMediaFile(null);
    setMediaName('');
    setMediaError(null);
  };

  const handleSend = async () => {
    if (!user) return;
    if (selected.size === 0) return;
    if (!message.trim() && !mediaFile) {
      setMediaError('Please enter a message or attach an image/video.');
      return;
    }

    if (!session || !whatsappServerConfigured()) {
      setShowNotConnectedModal(true);
      return;
    }

    // Confirm the live WhatsApp Web session before creating the campaign.
    try {
      const status = await getWhatsAppStatus(session);
      if (!status.ready) {
        setIsWhatsAppConnected(false);
        setShowNotConnectedModal(true);
        return;
      }
      setIsWhatsAppConnected(true);
    } catch {
      setIsWhatsAppConnected(false);
      setShowNotConnectedModal(true);
      return;
    }

    setSending(true);
    try {
      let uploadedMediaUrl: string | null = null;

      if (mediaFile) {
        const fileExt = mediaFile.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('campaign-media')
          .upload(filePath, mediaFile);

        if (!uploadErr && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('campaign-media')
            .getPublicUrl(filePath);
          uploadedMediaUrl = publicUrlData.publicUrl;
        }
      }

      const selectedContactObjects = contacts.filter((c) => selected.has(c.id));

      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          message: message.trim(),
          media_url: uploadedMediaUrl,
          media_type: mediaType,
        })
        .select()
        .single();

      if (campaignError || !campaignData) {
        throw new Error(campaignError?.message || 'Failed to create campaign record.');
      }

      const recipientsPayload = selectedContactObjects.map((c) => ({
        campaign_id: campaignData.id,
        contact_id: c.id,
        contact_name: c.name?.trim() || null,
        whatsapp_number: c.whatsapp_number,
        status: 'pending',
      }));

      const { error: recipError } = await supabase
        .from('campaign_recipients')
        .insert(recipientsPayload);

      if (recipError) throw new Error(recipError.message);

      const result = await sendWhatsApp(
        session,
        selectedContactObjects.map((c) => ({ number: c.whatsapp_number, name: c.name?.trim() || null })),
        message.trim(),
        mediaFile
      );

      const successful = result.results?.filter((r: { ok: boolean }) => r.ok) ?? [];
      const failed = result.results?.filter((r: { ok: boolean }) => !r.ok) ?? [];

      for (const item of result.results ?? []) {
        await supabase
          .from('campaign_recipients')
          .update({
            status: item.ok ? 'sent' : 'failed',
            whatsapp_message_id: item.messageId || null,
            error_message: item.error || null,
            sent_at: item.ok ? new Date().toISOString() : null,
          })
          .eq('campaign_id', campaignData.id)
          .eq('whatsapp_number', item.number);
      }

      await logActivity(
        'message_attempted',
        `WhatsApp Web sent ${successful.length} message(s); ${failed.length} failed`,
        user.id
      );

      setSuccessMessage(`Sent to ${successful.length} of ${selectedContactObjects.length} recipients.`);
      if (failed.length > 0) {
        setMediaError(`${failed.length} message(s) failed. Check Message History for details.`);
      }
      setMessage('');
      removeMedia();
      setSelected(new Set());
    } catch (err: unknown) {
      setMediaError(err instanceof Error ? err.message : 'Error sending message');
    } finally {
      setSending(false);
    }
  };

  const selectedContacts = contacts.filter((c) => selected.has(c.id));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Create Message</h1>
        <p className="text-slate-500 text-sm mt-1">
          Compose an official WhatsApp broadcast for Bee Home Creators customers
        </p>
      </div>

      {successMessage && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between">
          <p className="text-sm font-medium">{successMessage}</p>
          {onNavigateToHistory && (
            <button
              onClick={onNavigateToHistory}
              className="text-xs font-semibold underline hover:text-emerald-950"
            >
              View History
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Recipients List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Recipients</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select contacts to receive this WhatsApp message
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full">
              Selected contacts: {selected.size}
            </span>
          </div>

          {/* Search & Select All */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or number..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition"
              />
            </div>
            {contacts.length > 0 && (
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 font-medium transition-colors"
                >
                  {allFilteredSelected ? (
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  {allFilteredSelected ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-slate-400">
                  {filtered.length} of {contacts.length} displayed
                </span>
              </div>
            )}
          </div>

          {/* Contact list with checkboxes */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-5 h-5 bg-slate-100 rounded" />
                    <div className="w-9 h-9 bg-slate-100 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                      <div className="h-3 bg-slate-100 rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-500 text-sm font-medium">
                  {contacts.length === 0 ? 'No contacts available' : 'No matching contacts found'}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {contacts.length === 0 ? 'Add contacts first in the Contacts tab' : 'Try another query'}
                </p>
              </div>
            ) : (
              filtered.map((contact) => {
                const isSelected = selected.has(contact.id);
                const displayName =
                  contact.name && contact.name.trim() ? contact.name : 'Unnamed Contact';
                const isUnnamed = displayName === 'Unnamed Contact';

                const initials = !isUnnamed
                  ? displayName
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : '';

                return (
                  <div
                    key={contact.id}
                    onClick={() => toggleSelect(contact.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-300 flex-shrink-0" />
                    )}

                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isUnnamed
                          ? 'bg-slate-100 text-slate-400 border border-slate-200'
                          : 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800'
                      }`}
                    >
                      {isUnnamed ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-semibold">{initials}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          isUnnamed ? 'italic text-slate-500' : 'font-medium text-slate-800'
                        }`}
                      >
                        {displayName}
                      </p>
                      <p className="text-xs text-slate-500 truncate font-mono">
                        {formatPhoneDisplay(contact.whatsapp_number)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Message & Media Composer */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-base">Message Composer</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Draft your text and attach marketing photos or villa walkthrough videos
            </p>
          </div>

          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {/* Message Text Area */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Message Content
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Hello! Bee Home Creators has an exclusive update regarding your property inquiry..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition resize-none"
              />
              <div className="flex justify-between items-center text-xs text-slate-400 mt-1">
                <span>{message.length} characters</span>
                <span>Supports emojis & line breaks</span>
              </div>
            </div>

            {/* Media Upload Section */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Media Attachment (Optional)
              </label>

              {mediaPreview ? (
                <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-900/5">
                  <button
                    onClick={removeMedia}
                    className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors shadow-md"
                    title="Remove media"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="max-h-56 flex items-center justify-center bg-slate-950/5">
                    {mediaType === 'image' ? (
                      <img
                        src={mediaPreview}
                        alt="Preview"
                        className="max-h-56 w-auto object-contain mx-auto"
                      />
                    ) : (
                      <video
                        src={mediaPreview}
                        controls
                        className="max-h-56 w-full object-contain bg-black"
                      />
                    )}
                  </div>

                  <div className="px-4 py-2.5 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate mr-2">
                      {mediaType === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <Video className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-slate-700 truncate">{mediaName}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <label className="text-amber-600 hover:text-amber-700 font-semibold cursor-pointer">
                        Replace
                        <input
                          type="file"
                          accept={mediaType === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4'}
                          className="hidden"
                          onChange={(e) => handleFileSelect(e, mediaType!)}
                        />
                      </label>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={removeMedia}
                        className="text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, 'image')}
                  />
                  <div
                    onClick={() => imageInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 rounded-xl cursor-pointer transition-all text-center"
                  >
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-2">
                      <ImageIcon className="w-5 h-5 text-amber-600" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Add Image</span>
                    <span className="text-[11px] text-slate-400 mt-0.5">JPG, PNG, WEBP (Max 5MB)</span>
                  </div>

                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, 'video')}
                  />
                  <div
                    onClick={() => videoInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 rounded-xl cursor-pointer transition-all text-center"
                  >
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-2">
                      <Video className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Add Video</span>
                    <span className="text-[11px] text-slate-400 mt-0.5">MP4 (Max 16MB)</span>
                  </div>
                </div>
              )}

              {mediaError && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{mediaError}</span>
                </div>
              )}
            </div>

            {/* SEND WHATSAPP MESSAGE button */}
            <div className="pt-2">
              <button
                onClick={handleSend}
                disabled={sending || selected.size === 0}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    SEND WHATSAPP MESSAGE
                  </>
                )}
              </button>

              <div className="text-center mt-2.5">
                {selected.size === 0 ? (
                  <p className="text-xs text-slate-400">Select at least one recipient to enable sending</p>
                ) : (
                  <p className="text-xs text-slate-500 font-medium">
                    Ready to send to {selected.size} selected contact{selected.size !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Not Connected Modal */}
      {showNotConnectedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowNotConnectedModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center">
              WhatsApp Business is not connected yet.
            </h3>
            <p className="text-sm text-slate-600 text-center mt-2 leading-relaxed">
              Your message was <span className="font-semibold text-slate-800">NOT sent</span>.
              Bee Home Creators sends messages exclusively via the official WhatsApp Business Platform
              / Cloud API.
            </p>
            <p className="text-xs text-slate-400 text-center mt-2">
              To send live broadcasts, configure your Meta Developer credentials and Phone Number ID in
              WhatsApp Settings.
            </p>

            {selectedContacts.length > 0 && (
              <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3 max-h-28 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">
                  Selected Recipients ({selectedContacts.length}):
                </p>
                <div className="space-y-1">
                  {selectedContacts.slice(0, 4).map((c) => (
                    <p key={c.id} className="text-xs text-slate-600 truncate">
                      {c.name?.trim() || 'Unnamed Contact'} — {formatPhoneDisplay(c.whatsapp_number)}
                    </p>
                  ))}
                  {selectedContacts.length > 4 && (
                    <p className="text-[11px] text-slate-400 font-medium">
                      + {selectedContacts.length - 4} more contacts
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNotConnectedModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              {onNavigateToSettings && (
                <button
                  onClick={() => {
                    setShowNotConnectedModal(false);
                    onNavigateToSettings();
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-medium py-2.5 rounded-lg text-sm shadow-md transition-all"
                >
                  Configure API
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
