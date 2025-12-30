import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const api = async (method, url, body=null) => {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, ...(body?{'Content-Type':'application/json'}:{}) },
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
};

const parseWords = (text) => {
  if (!text) return [];
  const raw = text
    .split(/[\n,;\t\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const set = new Set();
  for (const w of raw) {
    if (/^[a-zA-Z\-\s]+$/.test(w)) set.add(w);
  }
  return Array.from(set);
};

export default function EditSecretWordbookPage(){
  const location = useLocation();
  const navigate = useNavigate();
  const [wordbooks, setWordbooks] = useState([]);
  const [wordbookId, setWordbookId] = useState('');
  const [wbTitle, setWbTitle] = useState('');
  const [existingCount, setExistingCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [wordsText, setWordsText] = useState('');
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(()=>{
    const run = async () => {
      setLoading(true); setError('');
      try {
        const list = await api('GET', '/api/admin/secret-boxes');
        setWordbooks(Array.isArray(list) ? list : []);
      } catch(e){ setError(e.message || 'Failed to load wordbooks'); }
      finally { setLoading(false); }
    };
    run();
  }, []);

  useEffect(()=>{
    try {
      const params = new URLSearchParams(location.search || '');
      const id = params.get('id');
      if (id) setWordbookId(id);
    } catch {}
  }, [location.search]);

  useEffect(()=>{
    const loadDetails = async () => {
      setWbTitle(''); setExistingCount(null); setOk('');
      if (!wordbookId) return;
      try {
        const details = await api('GET', `/api/wordbooks/${encodeURIComponent(wordbookId)}?limit=0`);
        setWbTitle(details?.title || '');
        setExistingCount(Number(details?.total_entries ?? (details?.entries?.length || 0)));
        setEntries(Array.isArray(details?.entries) ? details.entries.map(e=>e.word) : []);
      } catch {}
    };
    loadDetails();
  }, [wordbookId]);

  const handleSubmit = async () => {
    setError(''); setOk('');
    const words = parseWords(wordsText);
    if (!wordbookId) { setError('Please select a wordbook'); return; }
    if (words.length === 0) { setError('Please input at least one valid word'); return; }
    try {
      setSaving(true);
      const resp = await api('POST', `/api/admin/secret-boxes/${encodeURIComponent(wordbookId)}/add-words`, { words_text: words.join('\n') });
      const added = Number(resp?.added || words.length);
      setOk(`Inserted ${added} words successfully.${resp?.invalid_count?` (${resp.invalid_count} invalid ignored)`:''}`);
      setWordsText('');
      try {
        const details = await api('GET', `/api/wordbooks/${encodeURIComponent(wordbookId)}?limit=0`);
        setExistingCount(Number(details?.total_entries ?? (details?.entries?.length || 0)));
        setEntries(Array.isArray(details?.entries) ? details.entries.map(e=>e.word) : []);
      } catch {}
    } catch(e){ setError(e.message || 'Insert failed'); }
    finally { setSaving(false); }
  };

  const saveTitle = async () => {
    const t = (wbTitle || '').trim();
    if (!wordbookId || !t) return;
    try { await api('PUT', `/api/admin/secret-boxes/${encodeURIComponent(wordbookId)}/rename`, { title: t }); setOk('Title saved'); }
    catch(e){ setError(e.message || 'Rename failed'); }
  };

  const removeWord = async (w) => {
    try {
      await api('DELETE', `/api/admin/secret-boxes/${encodeURIComponent(wordbookId)}/remove-words`, { words: [w] });
      setEntries(prev => prev.filter(x => x !== w));
      setExistingCount(prev => (prev==null?null:Math.max(0, prev-1)));
    } catch(e){ setError(e.message || 'Remove failed'); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Edit Secret Wordbook</h2>
        <button className="px-3 py-1.5 bg-gray-100 rounded" onClick={()=>navigate('/admin/secret-box')}>Back</button>
      </div>
      {error && <div className="mb-3 text-red-600">{error}</div>}
      {ok && <div className="mb-3 text-green-700">{ok}</div>}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Select wordbook</label>
          <select className="w-full border rounded p-2 bg-gray-50" value={wordbookId} onChange={e=>setWordbookId(e.target.value)}>
            <option value="">-- Choose --</option>
            {wordbooks.map(wb => (
              <option key={wb._id} value={wb._id}>{wb.title}{wb.accessibility?` (${wb.accessibility})`:''}</option>
            ))}
          </select>
          {wbTitle && (
            <div className="mt-1 text-sm text-gray-600">Selected: {wbTitle}{existingCount!==null?` • ${existingCount} words`:''}</div>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Wordbook name</label>
          <div className="flex gap-2 items-center">
            <input className="flex-1 border rounded p-2" value={wbTitle} onChange={e=>setWbTitle(e.target.value)} placeholder="Enter new wordbook name" />
            <button onClick={saveTitle} className="px-3 py-1.5 rounded bg-blue-600 text-white">Save</button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Words to insert</label>
          <textarea className="w-full border rounded p-3 h-48" value={wordsText} onChange={e=>setWordsText(e.target.value)} placeholder={"One per line or separated by spaces:\napple\nbanana\n..."} />
          <div className="text-xs text-gray-500 mt-1">Non-letter characters are ignored; duplicates removed automatically.</div>
        </div>
        <div className="flex justify-end">
          <button disabled={saving} onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{saving?'Saving…':'Insert words'}</button>
        </div>

        {!!wordbookId && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search words" className="p-2 border rounded w-64" />
              <span className="text-sm text-gray-600">Total {entries.length}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto border p-3 rounded">
              {entries.filter(w => (search? w.toLowerCase().includes(search.toLowerCase()): true)).map(w => (
                <div key={w} className="flex items-center justify-between border rounded px-2 py-1">
                  <span>{w}</span>
                  <button onClick={()=>removeWord(w)} className="text-red-600 hover:underline text-sm">Remove</button>
                </div>
              ))}
              {entries.length === 0 && <div className="text-gray-500">No words yet</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
