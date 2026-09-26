import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchRecentActivities, formatRelativeTime } from '@/lib/activities';
import type { Activity } from '@/lib/supabase';
import {
  Users,
  Send,
  CheckCheck,
  Eye,
  AlertCircle,
  Activity as ActivityIcon,
  TrendingUp,
  UserPlus,
  Pencil,
  Trash2,
  MessageSquare,
  Radio,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [totalContacts, setTotalContacts] = useState(0);
  const [messagesSent, setMessagesSent] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [readCount, setReadCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [
          countRes,
          settingsRes,
          acts,
          recipientsRes,
        ] = await Promise.all([
          supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('whatsapp_settings')
            .select('is_connected')
            .eq('user_id', user.id)
            .maybeSingle(),
          fetchRecentActivities(user.id, 8),
          supabase
            .from('campaign_recipients')
            .select('status'),
        ]);

        setTotalContacts(countRes.count ?? 0);
        setIsConnected(Boolean(settingsRes.data?.is_connected));
        setActivities(acts);

        if (recipientsRes.data) {
          const sent = recipientsRes.data.filter((r) =>
            ['sent', 'delivered', 'read'].includes(r.status)
          ).length;
          const delivered = recipientsRes.data.filter((r) =>
            ['delivered', 'read'].includes(r.status)
          ).length;
          const read = recipientsRes.data.filter((r) => r.status === 'read').length;
          const failed = recipientsRes.data.filter((r) => r.status === 'failed').length;

          setMessagesSent(sent);
          setDeliveredCount(delivered);
          setReadCount(read);
          setFailedCount(failed);
        }
      } catch {
        // Fallback gracefully
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const stats = [
    {
      label: 'Total Contacts',
      value: totalContacts,
      displaySub: 'Saved real-estate contacts',
      icon: Users,
      bg: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Messages Sent',
      value: messagesSent,
      displaySub: isConnected ? 'Official WhatsApp messages' : 'WhatsApp not connected',
      icon: Send,
      bg: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Delivered',
      value: deliveredCount,
      displaySub: isConnected ? 'Verified delivery receipts' : 'Waiting for webhook',
      icon: CheckCheck,
      bg: 'bg-teal-50 text-teal-600',
    },
    {
      label: 'Read',
      value: readCount,
      displaySub: isConnected ? 'Blue double-check receipts' : 'Waiting for webhook',
      icon: Eye,
      bg: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Failed',
      value: failedCount,
      displaySub: isConnected ? 'Undeliverable / invalid' : '0 errors',
      icon: AlertCircle,
      bg: 'bg-rose-50 text-rose-600',
    },
  ];

  const activityIcons: Record<string, typeof UserPlus> = {
    contact_added: UserPlus,
    contact_edited: Pencil,
    contact_deleted: Trash2,
    message_attempted: MessageSquare,
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Overview of Bee Home Creators contacts and messaging performance
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-white shadow-sm w-fit">
          <Radio
            className={`w-3.5 h-3.5 ${
              isConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'
            }`}
          />
          <span className="text-slate-600">WhatsApp Business:</span>
          <span className={isConnected ? 'text-emerald-600 font-semibold' : 'text-slate-500 font-semibold'}>
            {isConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
      </div>

      {/* 5 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {stat.label}
                </span>
                <div className={`w-9 h-9 ${stat.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {loading ? (
                  <span className="inline-block w-8 h-7 bg-slate-100 rounded animate-pulse" />
                ) : (
                  stat.value
                )}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 truncate">{stat.displaySub}</p>
            </div>
          );
        })}
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
          <ActivityIcon className="w-5 h-5 text-slate-400" />
          <h2 className="font-semibold text-slate-800">Recent Activity</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 bg-slate-100 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm">No recent activity yet</p>
              <p className="text-slate-400 text-xs mt-1">
                Add contacts or compose messages to see activity here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((act) => {
                const Icon = activityIcons[act.type] ?? ActivityIcon;
                const iconColors: Record<string, string> = {
                  contact_added: 'bg-blue-50 text-blue-600',
                  contact_edited: 'bg-amber-50 text-amber-600',
                  contact_deleted: 'bg-red-50 text-red-600',
                  message_attempted: 'bg-green-50 text-green-600',
                };
                return (
                  <div
                    key={act.id}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        iconColors[act.type] ?? 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{act.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatRelativeTime(act.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
