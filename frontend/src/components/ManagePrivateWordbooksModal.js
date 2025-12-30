import React, { useEffect, useState, useMemo } from 'react';
import CreatePrivateWordbookModal from './CreatePrivateWordbookModal';

const ManagePrivateWordbooksModal = ({ isOpen, onClose }) => {
  const [books, setBooks] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [words, setWords] = useState([]);
  const [search, setSearch] = useState('');
  const [addText, setAddText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const token = () => localStorage.getItem('token');

  const loadBooks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/wordbooks/mine', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      setBooks(data);
      if (data.length && !selectedId) {
        setSelectedId(data[0]._id);
        setTitle(data[0].title || '');
        setWords((data[0].entries || []).map(e => e.word));
      }
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) loadBooks(); }, [isOpen]);

  useEffect(() => {
    const b = books.find(x => x._id === selectedId);
    if (b) {
      setTitle(b.title || '');
      setWords((b.entries || []).map(e => e.word));
    } else {
      setTitle('');
      setWords([]);
    }
  }, [selectedId, books]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words.filter(w => (q ? w.toLowerCase().includes(q) : true));
  }, [words, search]);

  const saveTitle = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/student/wordbooks/${selectedId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Rename failed');
      await loadBooks();
    } catch (e) {
      setError(e.message || 'Rename failed');
    } finally {
      setLoading(false);
    }
  };

  const addWords = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/student/wordbooks/${selectedId}/add-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ words_text: addText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Add failed');
      setAddText('');
      if (data?.invalid_count > 0) {
        try { alert(`Created with ${data.invalid_count} words not in dictionary, ignored:\n` + (data.invalid_words || []).slice(0,20).join(', ') + ((data.invalid_count>20)?' ...':'')); } catch {}
      }
      await loadBooks();
    } catch (e) {
      setError(e.message || 'Add failed');
    } finally {
      setLoading(false);
    }
  };

  const removeWord = async (w) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/student/wordbooks/${selectedId}/remove-words`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ words: [w] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      await loadBooks();
    } catch (e) {
      setError(e.message || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl p-6 relative max-h-[90vh] overflow-y-auto my-6">
        <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">Manage My Wordbooks</h3>
          <button
            onClick={()=>setShowCreate(true)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >Create wordbook</button>
        </div>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Select wordbook</label>
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="w-full p-2 border rounded">
            <option value="">Please select</option>
            {books.map(b => <option key={b._id} value={b._id}>{b.title}</option>)}
          </select>
        </div>
        {!!selectedId && (
          <>
            <div className="mb-3">
              <label className="block text-sm text-gray-600 mb-1">Wordbook name</label>
              <div className="flex gap-2 items-center">
                <input
                  value={title}
                  onChange={e=>setTitle(e.target.value)}
                  className="flex-1 p-2 border rounded"
                  placeholder="Enter new wordbook name"
                />
                {(() => {
                  const current = books.find(x => x._id === selectedId);
                  const originalTitle = (current?.title || '');
                  const locked = !!current?.locked_by_teacher;
                  const newTitle = (title || '').trim();
                  const canRename = !locked && !!newTitle && newTitle !== originalTitle;
                  return (
                    <button
                      onClick={saveTitle}
                      disabled={!canRename}
                      className={`px-4 py-2 rounded ${canRename ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                      title={locked ? 'This wordbook is managed by teacher and cannot be renamed' : (canRename ? 'Save new wordbook name' : 'Enable after editing name')}
                    >
                      Save name
                    </button>
                  );
                })()}
              </div>
              {(() => { const b = books.find(x=>x._id===selectedId); if (!b) return null; if (b.locked_by_teacher) { return (<p className="text-xs text-red-600 mt-1">This wordbook is managed by teacher; cannot edit or delete</p>);} return (b.is_favorites) ? (<p className="text-xs text-gray-500 mt-1">"My Favorites" cannot be deleted</p>) : null; })()}
            </div>
            <div className="mb-4 flex justify-end">
              {(() => { const b = books.find(x=>x._id===selectedId); const disabled = !b || b.is_favorites || b.locked_by_teacher; return (
                <button disabled={disabled} onClick={async ()=>{ if (!window.confirm('Delete this wordbook? This action cannot be undone.')) return; try { setLoading(true); const res = await fetch(`/api/student/wordbooks/${selectedId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } }); const data = await res.json().catch(()=>({})); if (!res.ok) throw new Error(data?.message || 'Delete failed'); setSelectedId(''); await loadBooks(); } catch(e){ setError(e?.message||'Delete failed'); } finally { setLoading(false); } }} className={`px-4 py-2 rounded ${disabled?'bg-gray-300 text-gray-600':'bg-red-600 text-white'}`}>Delete wordbook</button>
              ); })()}
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">Add words (one per line or space-separated)</label>
              {(() => { const b = books.find(x=>x._id===selectedId); const locked = !!b?.locked_by_teacher; return (
                <textarea value={addText} onChange={e=>setAddText(e.target.value)} className="w-full p-2 border rounded h-28" disabled={locked} placeholder={locked ? 'This wordbook is managed by teacher; cannot add words' : ''} />
              ); })()}
              <div className="mt-2 text-right">
                {(() => { const b = books.find(x=>x._id===selectedId); const locked = !!b?.locked_by_teacher; return (
                  <button onClick={addWords} disabled={locked} className={`px-4 py-2 rounded ${locked ? 'bg-gray-300 text-gray-600' : 'bg-green-600 text-white'}`}>{locked ? 'Unavailable' : 'Add'}</button>
                ); })()}
              </div>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search words in current wordbook" className="p-2 border rounded w-64" />
              <span className="text-sm text-gray-600">Total {words.length}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto border p-3 rounded">
              {(() => { const b = books.find(x=>x._id===selectedId); const locked = !!b?.locked_by_teacher; return (
                filtered.map(w => (
                  <div key={w} className="flex items-center justify-between border rounded px-2 py-1">
                    <span>{w}</span>
                    {!locked ? (
                      <button onClick={()=>removeWord(w)} className="text-red-600 hover:underline text-sm">Remove</button>
                    ) : (
                      <span className="text-xs text-gray-400">Locked</span>
                    )}
                  </div>
                ))
              ); })()}
              {filtered.length === 0 && <div className="text-gray-500">No matching words</div>}
            </div>
          </>
        )}
      </div>
      {showCreate && (
        <CreatePrivateWordbookModal
          isOpen={showCreate}
          onClose={()=>setShowCreate(false)}
          onCreated={(data)=>{
            // After creation, reload list and select the new one
            const id = data?.wordbook_id;
            (async ()=>{
              await loadBooks();
              if (id) setSelectedId(id);
            })();
          }}
        />
      )}
    </div>
  );
};

export default ManagePrivateWordbooksModal;
