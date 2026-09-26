import { useState } from 'react';
import { supabase, type Contact } from '@/lib/supabase';
import { logActivity } from '@/lib/activities';
import { normalizePhoneNumber, isValidPhoneNumber } from '@/lib/phone';
import { X, Loader2 } from 'lucide-react';

type Props = {
  contact: Contact | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ContactModal({ contact, userId, onClose, onSaved }: Props) {
  const [name, setName] = useState(contact?.name ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(contact?.whatsapp_number ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = !!contact;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedNumber = whatsappNumber.trim();
    if (!trimmedNumber) {
      setError('WhatsApp Number is required.');
      return;
    }

    const normalizedNumber = normalizePhoneNumber(trimmedNumber);
    if (!isValidPhoneNumber(normalizedNumber)) {
      setError('Please enter a valid WhatsApp phone number with country code (e.g. +91 98765 43210).');
      return;
    }

    setSaving(true);
    const finalName = name.trim() || null;
    const finalNotes = notes.trim() || null;

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          name: finalName,
          whatsapp_number: normalizedNumber,
          notes: finalNotes,
        })
        .eq('id', contact.id);

      setSaving(false);
      if (updateError) {
        setError(
          updateError.code === '23505'
            ? 'A contact with this WhatsApp number already exists.'
            : updateError.message
        );
        return;
      }
      await logActivity(
        'contact_edited',
        `Updated contact "${finalName || 'Unnamed Contact'}"`,
        userId
      );
      onSaved();
    } else {
      const { error: insertError } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: finalName,
          whatsapp_number: normalizedNumber,
          notes: finalNotes,
        });

      setSaving(false);
      if (insertError) {
        setError(
          insertError.code === '23505'
            ? 'A contact with this WhatsApp number already exists.'
            : insertError.message
        );
        return;
      }
      await logActivity(
        'contact_added',
        `Added contact "${finalName || 'Unnamed Contact'}"`,
        userId
      );
      onSaved();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Edit Contact' : 'Add New Contact'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Name <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition"
              placeholder="Leave empty or enter contact name"
            />
            <p className="text-xs text-slate-400 mt-1">If left empty, this contact will display as "Unnamed Contact".</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              WhatsApp Number <span className="text-amber-500 font-bold">*</span>
            </label>
            <input
              type="tel"
              required
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition"
              placeholder="+91 98765 43210"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Include country code (e.g. +91XXXXXXXXXX). Duplicates are prevented automatically.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition resize-none"
              placeholder="e.g. Interested in 3BHK villa, budget 85L..."
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-medium py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
