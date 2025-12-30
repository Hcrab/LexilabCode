import React, { useEffect, useState } from 'react';

const ManageTrackedWordbooksModal = ({ isOpen, onClose }) => {
  const [allBooks, setAllBooks] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = () => localStorage.getItem('token');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setError('');
      setLoading(true);
      try {
        const [wbRes, trRes] = await Promise.all([
          fetch('/api/student/wordbooks', { headers: { Authorization: `Bearer ${token()}` } }),
          fetch('/api/student/tracked-wordbooks', { headers: { Authorization: `Bearer ${token()}` } }),
        ]);
        const wb = wbRes.ok ? await wbRes.json() : [];
        const tr = trRes.ok ? await trRes.json() : { ids: [] };
        setAllBooks(Array.isArray(wb) ? wb : []);
        setChecked(new Set(Array.isArray(tr.ids) ? tr.ids : []));
      } catch (e) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  const toggle = (id) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/student/tracked-wordbooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ids: Array.from(checked) })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Save failed');
      onClose(true);
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto my-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Manage Tracked Wordbooks</h3>
          <button className="text-gray-500 hover:text-gray-800 text-2xl leading-none" onClick={() => onClose(false)} aria-label="Close">×</button>
        </div>
        {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}
        <p className="text-sm text-gray-600 mb-3">Select the wordbooks you want to track for learning. This affects the Word Overview display and statistics.</p>
        <div className="max-h-80 overflow-y-auto border rounded p-3">
          {loading && <div className="text-gray-500 text-sm">Loading...</div>}
          {!loading && allBooks.length === 0 && <div className="text-gray-500 text-sm">No wordbooks available.</div>}
          {!loading && allBooks.map(wb => (
            <label key={wb._id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={checked.has(wb._id)} onChange={()=>toggle(wb._id)} />
              <span className="font-medium text-gray-800">{wb.title}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={()=>onClose(false)}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default ManageTrackedWordbooksModal;
