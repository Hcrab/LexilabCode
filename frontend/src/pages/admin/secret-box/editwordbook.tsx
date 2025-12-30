import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

type Wordbook = {
  _id: string;
  title: string;
  description?: string;
  accessibility?: string;
};

const api = async (method: string, url: string, body?: any) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
};

const parseWords = (text: string): string[] => {
  if (!text) return [];
  // Split by line, comma, spaces; keep only simple a-z words
  const raw = text
    .split(/[\n,;\t\s]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Deduplicate and filter non-ASCII letters
  const set = new Set<string>();
  for (const w of raw) {
    if (/^[a-zA-Z\-\s]+$/.test(w)) set.add(w);
  }
  return Array.from(set);
};

export default function EditSecretWordbookPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [wordbookId, setWordbookId] = useState('');
  const [wbTitle, setWbTitle] = useState('');
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [wordsText, setWordsText] = useState('');

  // Load wordbooks for selection if no id in URL
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const list: Wordbook[] = await api('GET', '/api/wordbooks');
        setWordbooks(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load wordbooks');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // Sync selected id from query
  useEffect(() => {
    if (typeof id === 'string' && id) setWordbookId(id);
  }, [id]);

  // Load selected wordbook details (title + count)
  useEffect(() => {
    const loadDetails = async () => {
      setWbTitle('');
      setExistingCount(null);
      setOk('');
      if (!wordbookId) return;
      try {
        const details = await api('GET', `/api/wordbooks/${encodeURIComponent(wordbookId)}?limit=0`);
        setWbTitle(details?.title || '');
        setExistingCount(Number(details?.total_entries ?? (details?.entries?.length || 0)));
      } catch (_) {
        // ignore
      }
    };
    loadDetails();
  }, [wordbookId]);

  const selectedWb = useMemo(() => wordbooks.find((w) => w._id === wordbookId), [wordbooks, wordbookId]);

  const handleSubmit = async () => {
    setOk(''); setError('');
    const words = parseWords(wordsText);
    if (!wordbookId) { setError('Please select a wordbook'); return; }
    if (words.length === 0) { setError('Please input at least one valid word'); return; }
    try {
      setSaving(true);
      await api('POST', `/api/wordbooks/${encodeURIComponent(wordbookId)}/words`, { words });
      setOk(`Inserted ${words.length} words successfully.`);
      setWordsText('');
      // Reload count
      try {
        const details = await api('GET', `/api/wordbooks/${encodeURIComponent(wordbookId)}?limit=0`);
        setExistingCount(Number(details?.total_entries ?? (details?.entries?.length || 0)));
      } catch {}
    } catch (e: any) {
      setError(e?.message || 'Insert failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Edit Secret Wordbook</h1>
        <button
          onClick={() => router.push('/admin/secret-box')}
          className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200"
        >
          Back
        </button>
      </div>

      {error && <div className="mb-3 text-red-600">{error}</div>}
      {ok && <div className="mb-3 text-green-700">{ok}</div>}

      <div className="space-y-4 bg-white border rounded-xl p-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Select wordbook</label>
          <select
            value={wordbookId}
            onChange={(e) => setWordbookId(e.target.value)}
            className="w-full border rounded p-2 bg-gray-50"
          >
            <option value="">-- Choose --</option>
            {wordbooks.map((wb) => (
              <option key={wb._id} value={wb._id}>{wb.title} {wb.accessibility ? `(${wb.accessibility})` : ''}</option>
            ))}
          </select>
          {wbTitle && (
            <div className="mt-1 text-sm text-gray-600">Selected: {wbTitle}{existingCount !== null ? ` • ${existingCount} words` : ''}</div>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Words to insert</label>
          <textarea
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            placeholder={"One per line or separated by spaces:\napple\nbanana\n..."}
            className="w-full border rounded p-3 h-48"
          />
          <div className="text-xs text-gray-500 mt-1">Non-letter characters are ignored; duplicates are removed automatically.</div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            disabled={saving}
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Insert words'}
          </button>
        </div>
      </div>
    </div>
  );
}

