import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase, type Campaign, type CampaignRecipient } from '@/lib/supabase';
import { formatPhoneDisplay } from '@/lib/phone';
import {
  History,
  Search,
  Calendar,
  Clock,
  Users,
  Send,
  CheckCheck,
  Eye,
  AlertCircle,
  Image as ImageIcon,
  Video,
  X,
  ChevronRight,
  Filter,
  User,
  ExternalLink,
} from 'lucide-react';

type CampaignWithStats = Campaign & {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pendingCount: number;
};

export default function MessageHistory() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithStats | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<string>('all');
  const [recipientSearch, setRecipientSearch] = useState('');

  const loadCampaigns = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (campaignError || !campaignData) {
        setCampaigns([]);
        setLoading(false);
        return;
      }

      // Fetch all recipients for these campaigns to aggregate stats
      const campaignIds = campaignData.map((c) => c.id);
      if (campaignIds.length === 0) {
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const { data: recipientData } = await supabase
        .from('campaign_recipients')
        .select('campaign_id, status')
        .in('campaign_id', campaignIds);

      const recipientMap: Record<string, { total: number; sent: number; delivered: number; read: number; failed: number; pending: number }> = {};

      campaignIds.forEach((id) => {
        recipientMap[id] = { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, pending: 0 };
      });

      (recipientData ?? []).forEach((r) => {
        const stats = recipientMap[r.campaign_id];
        if (stats) {
          stats.total += 1;
          if (r.status === 'sent') stats.sent += 1;
          else if (r.status === 'delivered') stats.delivered += 1;
          else if (r.status === 'read') stats.read += 1;
          else if (r.status === 'failed') stats.failed += 1;
          else if (r.status === 'pending') stats.pending += 1;
        }
      });

      const fullCampaigns: CampaignWithStats[] = campaignData.map((c) => {
        const stats = recipientMap[c.id] ?? {
          total: 0,
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          pending: 0,
        };
        return {
          ...c,
          totalRecipients: stats.total,
          sentCount: stats.sent,
          deliveredCount: stats.delivered,
          readCount: stats.read,
          failedCount: stats.failed,
          pendingCount: stats.pending,
        };
      });

      setCampaigns(fullCampaigns);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const openCampaignDetails = async (campaign: CampaignWithStats) => {
    setSelectedCampaign(campaign);
    setLoadingRecipients(true);
    setRecipientFilter('all');
    setRecipientSearch('');

    const { data } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });

    setRecipients((data ?? []) as CampaignRecipient[]);
    setLoadingRecipients(false);
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return c.message.toLowerCase().includes(q);
  });

  const filteredRecipients = recipients.filter((r) => {
    if (recipientFilter !== 'all' && r.status !== recipientFilter) return false;
    const q = recipientSearch.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (r.contact_name ?? 'unnamed contact').toLowerCase().includes(q);
    const phoneMatch = r.whatsapp_number.toLowerCase().includes(q);
    return nameMatch || phoneMatch;
  });

  const statusBadge = (status: CampaignRecipient['status']) => {
    switch (status) {
      case 'read':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <Eye className="w-3 h-3" /> Read
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
            <CheckCheck className="w-3 h-3" /> Delivered
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Send className="w-3 h-3" /> Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            Pending
          </span>
        );
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Message History</h1>
          <p className="text-slate-500 text-sm mt-1">
            Audit log of sent broadcasts and delivery reports from WhatsApp Business Platform
          </p>
        </div>

        <div className="text-xs text-slate-400 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
          {campaigns.length} total broadcast{campaigns.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search message history by keyword..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition"
        />
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-3">
                <div className="h-4 bg-slate-100 rounded w-1/4" />
                <div className="h-10 bg-slate-100 rounded" />
                <div className="h-4 bg-slate-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center py-16 px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <History className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold">No message campaigns yet</p>
            <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
              Broadcasts created in "Create Message" will appear here with delivery, read, and failure
              statuses.
            </p>
          </div>
        ) : (
          filteredCampaigns.map((camp) => {
            const dateObj = new Date(camp.created_at);
            const formattedDate = dateObj.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const formattedTime = dateObj.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={camp.id}
                onClick={() => openCampaignDetails(camp)}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Date, Time & Excerpt */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" />
                        {formattedDate}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formattedTime}
                      </span>
                      {camp.media_url && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {camp.media_type === 'video' ? (
                              <Video className="w-3 h-3 text-blue-500" />
                            ) : (
                              <ImageIcon className="w-3 h-3 text-amber-500" />
                            )}
                            {camp.media_type === 'video' ? 'Video' : 'Image'}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-slate-800 line-clamp-2 font-medium">
                      {camp.message || <span className="italic text-slate-400">Media broadcast with no text caption</span>}
                    </p>
                  </div>

                  {/* Right: Metrics & Arrow */}
                  <div className="flex items-center gap-4 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div className="px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-100 min-w-14">
                        <p className="text-[10px] uppercase font-semibold text-slate-400">Recipients</p>
                        <p className="font-bold text-slate-800 text-sm mt-0.5">{camp.totalRecipients}</p>
                      </div>
                      <div className="px-2 py-1.5 bg-blue-50/60 rounded-lg border border-blue-100/60 min-w-14">
                        <p className="text-[10px] uppercase font-semibold text-blue-500">Sent</p>
                        <p className="font-bold text-blue-700 text-sm mt-0.5">{camp.sentCount}</p>
                      </div>
                      <div className="px-2 py-1.5 bg-teal-50/60 rounded-lg border border-teal-100/60 min-w-14">
                        <p className="text-[10px] uppercase font-semibold text-teal-500">Delivered</p>
                        <p className="font-bold text-teal-700 text-sm mt-0.5">{camp.deliveredCount}</p>
                      </div>
                      <div className="px-2 py-1.5 bg-emerald-50/60 rounded-lg border border-emerald-100/60 min-w-14">
                        <p className="text-[10px] uppercase font-semibold text-emerald-500">Read</p>
                        <p className="font-bold text-emerald-700 text-sm mt-0.5">{camp.readCount}</p>
                      </div>
                      <div className="px-2 py-1.5 bg-rose-50/60 rounded-lg border border-rose-100/60 min-w-14">
                        <p className="text-[10px] uppercase font-semibold text-rose-500">Failed</p>
                        <p className="font-bold text-rose-700 text-sm mt-0.5">{camp.failedCount}</p>
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-amber-50 flex items-center justify-center transition-colors">
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Campaign Details Modal */}
      {selectedCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedCampaign(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-800">Campaign Details</h2>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Campaign Message & Media Preview */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Message Content
                </p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap font-sans">
                  {selectedCampaign.message || <span className="text-slate-400 italic">No text caption</span>}
                </p>

                {selectedCampaign.media_url && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Attached Media:</p>
                    {selectedCampaign.media_type === 'video' ? (
                      <video
                        src={selectedCampaign.media_url}
                        controls
                        className="max-h-48 rounded-lg border border-slate-200 bg-black"
                      />
                    ) : (
                      <img
                        src={selectedCampaign.media_url}
                        alt="Campaign media"
                        className="max-h-48 rounded-lg border border-slate-200 object-contain bg-white"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Status summary banner */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                  <span className="block font-bold text-blue-700 text-base">
                    {selectedCampaign.sentCount}
                  </span>
                  <span className="text-blue-600">Sent</span>
                </div>
                <div className="p-2.5 bg-teal-50 border border-teal-100 rounded-lg">
                  <span className="block font-bold text-teal-700 text-base">
                    {selectedCampaign.deliveredCount}
                  </span>
                  <span className="text-teal-600">Delivered</span>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <span className="block font-bold text-emerald-700 text-base">
                    {selectedCampaign.readCount}
                  </span>
                  <span className="text-emerald-600">Read</span>
                </div>
                <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg">
                  <span className="block font-bold text-rose-700 text-base">
                    {selectedCampaign.failedCount}
                  </span>
                  <span className="text-rose-600">Failed</span>
                </div>
              </div>

              {/* Recipients Breakdown Header & Filter */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-slate-800 text-sm">
                    Recipients ({recipients.length})
                  </h3>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Search recipient..."
                      className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />

                    <select
                      value={recipientFilter}
                      onChange={(e) => setRecipientFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="all">All Statuses</option>
                      <option value="sent">Sent</option>
                      <option value="delivered">Delivered</option>
                      <option value="read">Read</option>
                      <option value="failed">Failed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>

                {/* Recipients Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {loadingRecipients ? (
                    <div className="p-6 text-center text-xs text-slate-400">Loading recipients...</div>
                  ) : filteredRecipients.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">No matching recipients</div>
                  ) : (
                    filteredRecipients.map((recip) => (
                      <div
                        key={recip.id}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {recip.contact_name?.trim() || 'Unnamed Contact'}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {formatPhoneDisplay(recip.whatsapp_number)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {statusBadge(recip.status)}
                          {recip.error_message && (
                            <span className="text-[10px] text-rose-600 truncate max-w-xs">
                              {recip.error_message}
                            </span>
                          )}
                          {recip.sent_at && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(recip.sent_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
