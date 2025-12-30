import React, { useEffect, useState } from 'react';

const StudentOnboardingModal = ({ isOpen, onClose, initialGoal = 10 }) => {
  const [allBooks, setAllBooks] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [goal, setGoal] = useState(String(initialGoal || 10));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('self'); // 'self' | 'teacher'

  const token = () => localStorage.getItem('token');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true);
      setError('');
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
      const t = token();
      // Save tracked wordbooks first
      const resTracked = await fetch('/api/student/tracked-wordbooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ids: Array.from(checked) })
      });
      const dataTracked = await resTracked.json().catch(()=>({}));
      if (!resTracked.ok) throw new Error(dataTracked?.message || 'Failed to save wordbooks');

      // Save daily goal
      const g = Math.max(0, parseInt(goal, 10) || 0);
      const resGoal = await fetch('/api/student/learning-goal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ goal: g })
      });
      const dataGoal = await resGoal.json().catch(()=>({}));
      if (!resGoal.ok) throw new Error(dataGoal?.message || 'Failed to save goal');
      // Mark first_login = false
      try {
        await fetch('/api/student/first-login', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ first_login: false })
        });
      } catch (_) {}

      onClose(true);
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const skipForTeacher = async () => {
    setSaving(true);
    setError('');
    try {
      const t = token();
      try {
        await fetch('/api/student/first-login', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ first_login: false })
        });
      } catch (_) {}
      try { localStorage.setItem('skip_goal_until_teacher', '1'); } catch {}
      onClose(true);
    } catch (e) {
      setError(e?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-1">Welcome to your vocabulary plan</h3>
        <p className="text-gray-600 mb-4">Please choose your learning mode.</p>
        {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}
        <div className="mb-4 flex flex-col md:flex-row gap-3">
          <label className={`flex-1 p-3 border rounded-lg cursor-pointer ${mode==='self' ? 'bg-blue-50 border-blue-300' : 'bg-gray-50'}`}>
            <input type="radio" name="mode" className="mr-2" checked={mode==='self'} onChange={()=>setMode('self')} />
            I am a self-learning user
          </label>
          <label className={`flex-1 p-3 border rounded-lg cursor-pointer ${mode==='teacher' ? 'bg-blue-50 border-blue-300' : 'bg-gray-50'}`}>
            <input type="radio" name="mode" className="mr-2" checked={mode==='teacher'} onChange={()=>setMode('teacher')} />
            I need to link with a teacher
          </label>
        </div>
        {mode === 'self' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <div className="text-sm font-semibold text-gray-700 mb-2">Select wordbooks</div>
            <div className="border rounded p-3 max-h-72 overflow-y-auto bg-gray-50">
              {loading && <div className="text-sm text-gray-500">Loading...</div>}
              {!loading && allBooks.length === 0 && <div className="text-sm text-gray-500">No wordbooks available</div>}
              {!loading && allBooks.map(wb => (
                <label key={wb._id} className="flex items-start gap-3 p-3 rounded hover:bg-white cursor-pointer border-b last:border-b-0">
                  <input className="mt-1" type="checkbox" checked={checked.has(wb._id)} onChange={()=>toggle(wb._id)} />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{wb.title}</div>
                    {wb.description && (
                      <div className="text-xs text-gray-600 mt-1 break-words">
                        {wb.description}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Daily goal (words)</div>
            <input type="number" min="0" max="500" value={goal} onChange={e=>setGoal(e.target.value)} className="w-full p-3 border rounded bg-gray-50" />
            <p className="text-xs text-gray-500 mt-2">Tip: Start with 10 and adjust as needed.</p>
          </div>
        </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={()=>onClose(false)}>Set up later</button>
          {mode === 'self' ? (
            <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Start learning'}</button>
          ) : (
            <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={saving} onClick={skipForTeacher}>{saving ? 'Processing…' : 'Link with teacher (continue to dashboard)'}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentOnboardingModal;
