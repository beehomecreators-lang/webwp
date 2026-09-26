import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase, type Contact } from '@/lib/supabase';
import { logActivity } from '@/lib/activities';
import { formatPhoneDisplay } from '@/lib/phone';
import ContactModal from '@/components/ContactModal';
import CsvImportModal from '@/components/CsvImportModal';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  CheckSquare,
  Square,
  X,
  AlertTriangle,
  Loader2,
  Upload,
  Download,
  User,
} from 'lucide-react';

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setContacts((data ?? []) as Contact[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const displayName = (c.name && c.name.trim()) ? c.name.toLowerCase() : 'unnamed contact';
    return (
      displayName.includes(q) ||
      c.whatsapp_number.toLowerCase().includes(q) ||
      (c.notes ?? '').toLowerCase().includes(q)
    );
  });

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    setEditingContact(null);
    setModalOpen(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setModalOpen(true);
  };

  const handleSaved = async () => {
    setModalOpen(false);
    setEditingContact(null);
    await loadContacts();
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    setDeleting(true);
    const { error: delError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);
    if (delError) {
      setError(delError.message);
      setDeleting(false);
      return;
    }
    const displayName = deleteTarget.name?.trim() || 'Unnamed Contact';
    await logActivity('contact_deleted', `Deleted contact "${displayName}"`, user.id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
    setDeleting(false);
    await loadContacts();
  };

  const handleDeleteSelected = async () => {
    if (!user || selected.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error: bulkError } = await supabase
      .from('contacts')
      .delete()
      .in('id', ids);
    if (bulkError) {
      setError(bulkError.message);
      setDeleting(false);
      return;
    }
    await logActivity(
      'contact_deleted',
      `Deleted ${ids.length} contact${ids.length > 1 ? 's' : ''}`,
      user.id
    );
    setSelected(new Set());
    setDeleting(false);
    await loadContacts();
  };

  const handleExportCsv = () => {
    if (contacts.length === 0) return;
    const header = ['Name', 'WhatsApp Number', 'Notes', 'Created At'];
    const rows = contacts.map((c) => [
      `"${(c.name ?? '').replace(/"/g, '""')}"`,
      `"${c.whatsapp_number}"`,
      `"${(c.notes ?? '').replace(/"/g, '""')}"`,
      `"${new Date(c.created_at).toISOString()}"`,
    ]);
    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `bee_home_creators_contacts_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Contacts</h1>
          <p className="text-slate-500 text-sm mt-1">
            {contacts.length} total contact{contacts.length !== 1 ? 's' : ''} for Bee Home Creators
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setCsvModalOpen(true)}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium px-3.5 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
            title="Import Contacts from CSV"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={contacts.length === 0}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium px-3.5 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export Contacts as CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, WhatsApp number, or notes..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition"
        />
      </div>

      {/* Selection toolbar */}
      {contacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
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

          {selected.size > 0 && !allFilteredSelected && (
            <button
              onClick={deselectAll}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium underline"
            >
              Deselect All
            </button>
          )}

          {selected.size > 0 && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-xs font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                {selected.size} selected
              </span>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>
            </div>
          )}
        </div>
      )}

      {/* Contacts list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-5 h-5 bg-slate-100 rounded" />
                <div className="w-10 h-10 bg-slate-100 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-slate-100 rounded w-1/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/6" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">
              {contacts.length === 0 ? 'No contacts yet' : 'No contacts found'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {contacts.length === 0
                ? 'Add your first WhatsApp contact to get started'
                : 'Try adjusting your search criteria'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((contact) => {
              const isSelected = selected.has(contact.id);
              const displayName = contact.name && contact.name.trim() ? contact.name : 'Unnamed Contact';
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
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors ${
                    isSelected ? 'bg-amber-50/50' : ''
                  }`}
                >
                  <button
                    onClick={() => toggleSelect(contact.id)}
                    className="flex-shrink-0 text-slate-400 hover:text-amber-500 transition-colors"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isUnnamed
                        ? 'bg-slate-100 text-slate-400 border border-slate-200'
                        : 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800'
                    }`}
                  >
                    {isUnnamed ? (
                      <User className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-semibold">{initials}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isUnnamed ? 'italic text-slate-500 font-medium' : 'font-semibold text-slate-800'}`}>
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500 truncate font-mono mt-0.5">
                      {formatPhoneDisplay(contact.whatsapp_number)}
                    </p>
                    {contact.notes && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{contact.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(contact)}
                      className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(contact)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modalOpen && user && (
        <ContactModal
          contact={editingContact}
          userId={user.id}
          onClose={() => {
            setModalOpen(false);
            setEditingContact(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* CSV Import modal */}
      {csvModalOpen && user && (
        <CsvImportModal
          userId={user.id}
          existingContacts={contacts}
          onClose={() => setCsvModalOpen(false)}
          onImportComplete={async () => {
            setCsvModalOpen(false);
            await loadContacts();
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 text-center">Delete Contact</h3>
            <p className="text-sm text-slate-500 text-center mt-2">
              Are you sure you want to delete "
              {deleteTarget.name?.trim() || 'Unnamed Contact'}"? This cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
