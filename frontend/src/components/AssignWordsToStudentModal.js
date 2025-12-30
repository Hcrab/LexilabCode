import React, { useState, useEffect, useMemo } from 'react';

const AssignWordsToStudentModal = ({ isOpen, onClose, classId, student, onAssigned }) => {
  const [wordbooks, setWordbooks] = useState([]);
  const [selectedWordbook, setSelectedWordbook] = useState(null);
  const [words, setWords] = useState([]);
  const [selectedWords, setSelectedWords] = useState([]);
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sourceMode, setSourceMode] = useState('wordbook'); // 'wordbook' | 'all' | 'list'
  const [hideLearned, setHideLearned] = useState(true);
  const [studentExcludeSet, setStudentExcludeSet] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const run = async () => {
      setError('');
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const [wbRes, histRes, stuRes] = await Promise.all([
          fetch('/api/wordbooks', { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/classes/${classId}/students/${student?._id}/vocab-mission-history`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/students/${student?._id}/details`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        if (wbRes.ok) {
          const all = await wbRes.json();
          // Hide private wordbooks in this modal
          const filtered = Array.isArray(all) ? all.filter(wb => wb?.accessibility !== 'private') : [];
          setWordbooks(filtered);
        }
        if (histRes.ok) {
          const d = await histRes.json();
          setHistory(Array.isArray(d.vocab_mission) ? d.vocab_mission : []);
        }
        if (stuRes && stuRes.ok) {
          const sd = await stuRes.json();
          const exclude = new Set();
          (sd?.to_be_mastered || []).forEach(e => { const w = (typeof e === 'string' ? e : e.word); if (w) exclude.add(w); });
          (sd?.words_mastered || []).forEach(e => { const w = (typeof e === 'string' ? e : e.word); if (w) exclude.add(w); });
          setStudentExcludeSet(exclude);
        }
      } catch (e) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isOpen, classId, student?._id]);

  useEffect(() => {
    if (!isOpen || sourceMode !== 'wordbook' || !selectedWordbook) return;
    const run = async () => {
      setError('');
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/wordbooks/${selectedWordbook._id}?limit=0`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to load wordbook entries');
        const data = await res.json();
        const list = Array.isArray(data.entries) ? data.entries : [];
        list.sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
        setWords(list);
      } catch (e) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isOpen, selectedWordbook, sourceMode]);

  useEffect(() => {
    if (!isOpen || sourceMode !== 'all') return;
    const run = async () => {
      setError('');
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({ sort: 'word', page: String(page), limit: '50', search: search || '' });
        const res = await fetch(`/api/words?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to load all words');
        const data = await res.json();
        const list = Array.isArray(data.words) ? data.words.map(w => ({ word: w.word, definition_cn: w.definition_cn || '', tags: w.tags || [] })) : [];
        setWords(list);
        setPages(data.pages || 0);
      } catch (e) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isOpen, sourceMode, page, search]);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    let res = (words || []).filter(w => (q ? (w.word || '').toLowerCase().includes(q) : true));
    if (hideLearned && studentExcludeSet && studentExcludeSet.size > 0) {
      res = res.filter(w => !studentExcludeSet.has(w.word));
    }
    return res;
  }, [words, search, hideLearned, studentExcludeSet]);

  const onToggleWord = (w) => {
    const name = typeof w === 'string' ? w : w.word;
    setSelectedWords(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  };

  const [listText, setListText] = useState('');
  useEffect(() => { if (sourceMode === 'list') { setSelectedWords([]); } }, [sourceMode]);

  const handleAssign = async () => {
    let wordsToSend = selectedWords;
    if (sourceMode === 'list') {
      wordsToSend = (listText || '').split(/[\s,\n,]+/).map(s=>s.trim()).filter(Boolean);
    }
    if (!wordsToSend.length) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/classes/${classId}/students/${student?._id}/assign-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: wordsToSend })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Assignment failed');
      onAssigned?.(data?.message || 'Assigned');
      setSelectedWords([]);
      setListText('');
      onClose();
    } catch (e) {
      setError(e?.message || 'Assignment failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col relative">
        {/* Close X inside modal */}
        <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Left */}
          <div className="w-2/3 p-6 border-r overflow-y-auto">
            <h3 className="text-xl font-bold mb-2">Assign Words</h3>
            <div className="text-sm text-gray-600 mb-4">{student?.nickname || student?.username}</div>
            <div className="mb-4 flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="sourceMode" value="wordbook" checked={sourceMode==='wordbook'} onChange={()=>{ setSourceMode('wordbook'); setSelectedWordbook(null); setWords([]); }} />
                <span>Choose from wordbooks</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="sourceMode" value="all" checked={sourceMode==='all'} onChange={()=>{ setSourceMode('all'); setSelectedWordbook(null); setPage(1); setWords([]); }} />
                <span>Browse all words</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="sourceMode" value="list" checked={sourceMode==='list'} onChange={()=>{ setSourceMode('list'); setSelectedWordbook(null); setWords([]); }} />
                <span>Assign list</span>
              </label>
              <label className="ml-auto flex items-center gap-2">
                <input type="checkbox" checked={hideLearned} onChange={(e)=>setHideLearned(e.target.checked)} />
                <span>Hide words already learned (mastered/to be mastered)</span>
              </label>
            </div>
            {error && <p className="text-red-600 mb-2">{error}</p>}
            {sourceMode === 'wordbook' && (
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Select wordbook</label>
                <select className="w-full p-2 border rounded" value={selectedWordbook?._id || ''} onChange={(e)=>{
                  const wb = wordbooks.find(x=>x._id===e.target.value);
                  setSelectedWordbook(wb || null);
                }}>
                  <option value="">Please choose a wordbook</option>
                  {wordbooks.map(wb => <option key={wb._id} value={wb._id}>{wb.title}</option>)}
                </select>
              </div>
            )}
            {sourceMode === 'list' && (
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Words (comma, space, or newline separated)</label>
                <textarea value={listText} onChange={e=>setListText(e.target.value)} className="w-full p-2 border rounded h-32" placeholder="apple, banana, ... or one per line" />
              </div>
            )}
            {(sourceMode === 'wordbook' ? selectedWordbook : (sourceMode === 'all' ? true : false)) && (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search words" className="p-2 border rounded w-64" />
                  <button className="px-3 py-2 bg-gray-200 rounded" onClick={()=>setSelectedWords(filtered.map(w=>w.word))} disabled={!filtered.length}>Select all</button>
                  <button className="px-3 py-2 bg-gray-200 rounded" onClick={()=>setSelectedWords([])} disabled={!selectedWords.length}>Clear selection</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filtered.map(w => (
                    <div key={w.word} onClick={()=>onToggleWord(w)} className={`border p-3 rounded cursor-pointer ${selectedWords.includes(w.word)?'border-blue-600 bg-blue-50':'border-gray-200'}`}>
                      <div className="font-semibold">{w.word}</div>
                      <div className="text-sm text-gray-600 truncate">{w.definition_cn}</div>
                    </div>
                  ))}
                </div>
                {sourceMode==='all' && pages>1 && (
                  <div className="mt-4 flex justify-between items-center">
                    <button className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50" disabled={page<=1 || loading} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button>
                    <div className="text-sm text-gray-600">Page {page} of {pages}</div>
                    <button className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50" disabled={page>=pages || loading} onClick={()=>setPage(p=>p+1)}>Next</button>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Right: History */}
          <div className="w-1/3 p-6 overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Assignment History</h3>
            {loading && <p>Loading...</p>}
            {!loading && (!history || history.length === 0) && <p className="text-gray-500">No history yet</p>}
            <ul className="space-y-2">
              {history.map((h, idx) => (
                <li key={idx} className="border rounded p-3">
                  <div className="text-sm text-gray-500 mb-1">{h.assigned_date || 'Unknown date'} {h.source ? `· ${h.source}` : ''}</div>
                  <div className="font-medium">{h.word}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer inside modal */}
        <div className="p-4 border-t flex justify-end gap-3">
          <button className="px-4 py-2 bg-gray-200 rounded" onClick={onClose}>Cancel</button>
          {(() => { const count = sourceMode==='list' ? (listText||'').split(/[\s,\n,]+/).map(s=>s.trim()).filter(Boolean).length : selectedWords.length; return (
            <button className="px-5 py-2 bg-blue-600 text-white rounded disabled:opacity-50" disabled={loading || count===0} onClick={handleAssign}>
              {loading ? 'Submitting...' : `Assign ${count} words`}
            </button>
          ); })()}
        </div>
      </div>
    </div>
  );
};

export default AssignWordsToStudentModal;
