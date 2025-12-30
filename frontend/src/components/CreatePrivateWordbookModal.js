import React, { useState } from 'react';

const CreatePrivateWordbookModal = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    setError('');
    setResult(null);
    if (!text.trim() && !title.trim()) { setError('Please enter a title or word list'); return; }
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/student/wordbooks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title || undefined, words_text: text })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Creation failed');
      setResult(data);
      if (data?.invalid_count > 0) {
        try { alert(`Created, but ${data.invalid_count} words are not in the dictionary and were ignored:\n` + (data.invalid_words || []).slice(0,20).join(', ') + ((data.invalid_count>20)?' ...':'')); } catch {}
      }
      onCreated?.(data);
      onClose();
    } catch (e) {
      setError(e?.message || 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto my-6">
        <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
        <h3 className="text-xl font-bold mb-4">Create Private Wordbook</h3>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Wordbook title (optional)</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full p-2 border rounded" placeholder="e.g., My High-Frequency Words" />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-600 mb-1">Words (one per line, or space-separated)</label>
          <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full p-2 border rounded h-40" placeholder={"e.g.:\napple\nbanana\n..."} />
          <p className="text-xs text-gray-500 mt-1">We will keep only words present in the dictionary.</p>
        </div>
        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 bg-gray-200 rounded" onClick={onClose}>Cancel</button>
          <button className="px-5 py-2 bg-blue-600 text-white rounded disabled:opacity-50" disabled={loading || !text.trim()} onClick={handleSubmit}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePrivateWordbookModal;
