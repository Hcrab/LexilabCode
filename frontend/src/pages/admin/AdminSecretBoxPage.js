import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

const AdminSecretBoxPage = () => {
  const [boxes, setBoxes] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [words, setWords] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await api('GET', '/api/admin/secret-boxes');
      setBoxes(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim() && !words.trim()) { alert('Please enter a title or words'); return; }
    try {
      setSaving(true);
      await api('POST', '/api/admin/secret-boxes', { title, words_text: words });
      setShowCreate(false); setTitle(''); setWords('');
      await load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this wordbook?')) return;
    try {
      await api('DELETE', `/api/admin/secret-boxes/${id}`);
      await load();
    } catch (e) { alert(e.message); }
  };

  const startEdit = (box) => {
    setEditingId(box._id);
    setEditingTitle(box.title || '');
  };
  const cancelEdit = () => { setEditingId(null); setEditingTitle(''); };
  const saveEdit = async () => {
    if (!editingId) return;
    const t = (editingTitle || '').trim();
    if (!t) { alert('Title cannot be empty'); return; }
    try {
      await api('PUT', `/api/admin/secret-boxes/${editingId}/rename`, { title: t });
      cancelEdit();
      await load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Secret Wordbook Box</h2>
        <button className="px-4 py-2 bg-purple-600 text-white rounded" onClick={()=>setShowCreate(true)}>Create wordbook</button>
      </div>
      {error && <div className="text-red-600">{error}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxes.map(b => (
            <div key={b._id} className="bg-white p-4 rounded-xl shadow">
              {editingId === b._id ? (
                <div className="space-y-2">
                  <input value={editingTitle} onChange={e=>setEditingTitle(e.target.value)} className="w-full border rounded p-2" />
                  <div className="flex justify-end gap-2">
                    <button className="px-3 py-1.5 bg-gray-200 rounded" onClick={cancelEdit}>Cancel</button>
                    <button className="px-3 py-1.5 bg-blue-600 text-white rounded" onClick={saveEdit}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-semibold text-gray-900">{b.title}</div>
                  <div className="text-sm text-gray-600 mt-1">{b.count} words</div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded" onClick={()=>navigate(`/admin/secret-box/edit?id=${encodeURIComponent(b._id)}`)}>Edit</button>
                    <button className="px-3 py-1.5 bg-gray-200 rounded" onClick={()=>startEdit(b)}>Rename</button>
                    <button className="px-3 py-1.5 bg-red-600 text-white rounded" onClick={()=>remove(b._id)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {boxes.length === 0 && <div className="text-gray-600">No wordbooks yet. Click “Create wordbook” in the top right.</div>}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative">
            <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={()=>setShowCreate(false)}>×</button>
            <h3 className="text-lg font-bold text-gray-800 mb-3">Create Secret Wordbook</h3>
            <label className="block text-sm text-gray-600 mb-1">Wordbook title</label>
            <input className="w-full border rounded p-2 mb-3" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g., Grade 7 Midterm" />
            <label className="block text-sm text-gray-600 mb-1">Words (one per line or space-separated)</label>
            <textarea className="w-full border rounded p-3 h-48" value={words} onChange={e=>setWords(e.target.value)} placeholder={"e.g.:\napple\nbanana\n..."} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-4 py-2 bg-gray-200 rounded" onClick={()=>setShowCreate(false)}>Cancel</button>
              <button className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50" disabled={saving} onClick={create}>{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSecretBoxPage;
