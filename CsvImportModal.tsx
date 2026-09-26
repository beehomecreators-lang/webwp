import { useState, useRef } from 'react';
import { supabase, type Contact } from '@/lib/supabase';
import { logActivity } from '@/lib/activities';
import { normalizePhoneNumber, isValidPhoneNumber } from '@/lib/phone';
import { X, Upload, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

type Props = {
  userId: string;
  existingContacts: Contact[];
  onClose: () => void;
  onImportComplete: () => void;
};

type ParsedRow = {
  name: string | null;
  whatsapp_number: string;
  notes: string | null;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
};

export default function CsvImportModal({
  userId,
  existingContacts,
  onClose,
  onImportComplete,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const existingNumberSet = new Set(
    existingContacts.map((c) => normalizePhoneNumber(c.whatsapp_number))
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setError(null);
    setResultMessage(null);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        parseCsv(text);
      } catch (err: unknown) {
        setError('Failed to parse CSV file: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(selectedFile);
  };

  const parseCsv = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      setError('CSV must have a header row and at least one contact row.');
      return;
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
    let nameIdx = header.findIndex((h) => h === 'name' || h === 'contact name');
    let phoneIdx = header.findIndex(
      (h) =>
        h.includes('whatsapp') ||
        h.includes('phone') ||
        h.includes('mobile') ||
        h.includes('number')
    );
    let notesIdx = header.findIndex((h) => h.includes('note') || h.includes('remark'));

    // Fallbacks if not detected by header name
    if (phoneIdx === -1) phoneIdx = 1;
    if (nameIdx === -1) nameIdx = 0;

    const seenInBatch = new Set<string>();
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV column split respecting quotes
      const cols = line
        .match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
        ?.map((val) => val.replace(/^"|"$/g, '').trim()) ??
        line.split(',').map((val) => val.trim());

      const rawPhone = cols[phoneIdx] ?? '';
      const rawName = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : '';
      const rawNotes = notesIdx !== -1 && cols[notesIdx] ? cols[notesIdx] : '';

      if (!rawPhone && !rawName) continue;

      const normalized = normalizePhoneNumber(rawPhone);

      if (!rawPhone || !isValidPhoneNumber(normalized)) {
        rows.push({
          name: rawName || null,
          whatsapp_number: rawPhone,
          notes: rawNotes || null,
          status: 'invalid',
          reason: 'Invalid phone format',
        });
        continue;
      }

      if (existingNumberSet.has(normalized) || seenInBatch.has(normalized)) {
        rows.push({
          name: rawName || null,
          whatsapp_number: normalized,
          notes: rawNotes || null,
          status: 'duplicate',
          reason: 'Duplicate WhatsApp number',
        });
        continue;
      }

      seenInBatch.add(normalized);
      rows.push({
        name: rawName || null,
        whatsapp_number: normalized,
        notes: rawNotes || null,
        status: 'valid',
      });
    }

    setParsedRows(rows);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) {
      setError('No valid, non-duplicate contacts to import.');
      return;
    }

    setImporting(true);
    setError(null);

    const payload = validRows.map((r) => ({
      user_id: userId,
      name: r.name,
      whatsapp_number: r.whatsapp_number,
      notes: r.notes,
    }));

    const { error: insertError } = await supabase.from('contacts').insert(payload);

    setImporting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await logActivity(
      'contact_added',
      `Imported ${validRows.length} contacts via CSV`,
      userId
    );

    setResultMessage(`Successfully imported ${validRows.length} contacts!`);
    setTimeout(() => {
      onImportComplete();
    }, 1200);
  };

  const validCount = parsedRows.filter((r) => r.status === 'valid').length;
  const duplicateCount = parsedRows.filter((r) => r.status === 'duplicate').length;
  const invalidCount = parsedRows.filter((r) => r.status === 'invalid').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-800">Import Contacts (CSV)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            Upload a CSV file containing your contacts. Name is optional; WhatsApp Number is required.
            Duplicates will be automatically skipped.
          </p>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-amber-50/20 transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">
              {file ? file.name : 'Click to select a .CSV file'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Columns: Name, WhatsApp Number, Notes</p>
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-medium">
                  <span className="block text-base font-bold">{validCount}</span> Ready to import
                </div>
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 font-medium">
                  <span className="block text-base font-bold">{duplicateCount}</span> Duplicates
                </div>
                <div className="p-2.5 bg-rose-50 text-rose-700 rounded-lg border border-rose-100 font-medium">
                  <span className="block text-base font-bold">{invalidCount}</span> Invalid
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 text-xs">
                {parsedRows.slice(0, 50).map((row, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-slate-800 truncate">
                        {row.name || <span className="text-slate-400 italic">Unnamed Contact</span>}
                      </p>
                      <p className="text-slate-500 truncate">{row.whatsapp_number}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${
                        row.status === 'valid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : row.status === 'duplicate'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
              {parsedRows.length > 50 && (
                <p className="text-xs text-slate-400 text-center">
                  Showing first 50 of {parsedRows.length} rows
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {resultMessage && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{resultMessage}</span>
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
              type="button"
              onClick={handleImport}
              disabled={importing || validCount === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-medium py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `Import ${validCount} Contacts`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
