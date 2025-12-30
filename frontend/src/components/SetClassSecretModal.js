import React, { useEffect, useState } from 'react';

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

const SetClassSecretModal = ({ isOpen, onClose, classId, onApplied }) => {
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const data = await api('GET', '/api/admin/secret-boxes');
        setBoxes(Array.isArray(data) ? data : []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    };
    load();
  }, [isOpen]);

  const apply = async () => {
    if (!Array.isArray(selected) || selected.length === 0) { setError('Please select at least one wordbook'); return; }
    try {
      setApplying(true); setError('');
      const res = await api('POST', `/api/classes/${classId}/secret-wordbook-from-box`, { box_ids: selected });
      onApplied && onApplied(res?.message || 'Applied');
      onClose();
    } catch (e) { setError(e.message); }
    finally { setApplying(false); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative">
        <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={onClose} aria-label="Close">×</button>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Set class custom wordbooks (multi-select)</h3>
        {error && <div className="text-red-600 mb-3">{error}</div>}
        {loading ? (
          <div>Loading…</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {boxes.length === 0 ? (
              <div className="text-gray-600">No wordbooks yet. Please create one in Secret Wordbook Box.</div>
            ) : boxes.map(b => {
              const checked = Array.isArray(selected) && selected.includes(b._id);
              return (
                <label key={b._id} className={`block p-3 rounded border cursor-pointer ${checked?'border-purple-600 bg-purple-50':'border-gray-200'}`}>
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={checked}
                    onChange={(e)=>{
                      setSelected(prev=>{
                        const set = new Set(prev||[]);
                        if (e.target.checked) set.add(b._id); else set.delete(b._id);
                        return Array.from(set);
                      });
                    }}
                  />
                  <span className="font-semibold text-gray-900">{b.title}</span>
                  <span className="text-sm text-gray-600 ml-2">{b.count} words</span>
                </label>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-4 py-2 bg-gray-200 rounded" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50" disabled={applying || !(Array.isArray(selected) && selected.length>0)} onClick={apply}>{applying ? 'Applying…' : 'Apply to class'}</button>
        </div>
      </div>
    </div>
  );
};

export default SetClassSecretModal;
