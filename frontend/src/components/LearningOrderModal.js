import React, { useEffect, useState } from 'react';

const LearningOrderModal = ({ isOpen, onClose, wordbooks }) => {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/student/learning-preference', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(()=>({}));
        if (res.ok) setSelected(data?.priority_wordbook_id || '');
      } catch (_) {}
    };
    load();
  }, [isOpen]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/student/learning-preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priority_wordbook_id: selected || null })
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

  const orderText = [
    '1) Teacher-assigned words',
    selected ? `2) From wordbook: ${(wordbooks.find(w=>w._id===selected)?.title) || 'Selected'}` : null,
    '3) Other self-study words'
  ].filter(Boolean).join(' → ');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl p-6 relative">
        <button aria-label="Close" onClick={()=>onClose(false)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
        <h3 className="text-xl font-bold mb-2">Adjust Learning Order</h3>
        <p className="text-sm text-gray-600 mb-4">Current order: {orderText}</p>
        {error && <p className="text-red-600 mb-2 text-sm">{error}</p>}
        <div className="mb-4">
          <label className="block text-sm text-gray-600 mb-1">Priority wordbook (optional)</label>
          <select value={selected} onChange={(e)=>setSelected(e.target.value)} className="w-full p-2 border rounded bg-gray-50">
            <option value="">No priority (teacher assignments only)</option>
            {wordbooks.map(wb => (
              <option key={wb._id} value={wb._id}>{wb.title}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={()=>onClose(false)}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default LearningOrderModal;
