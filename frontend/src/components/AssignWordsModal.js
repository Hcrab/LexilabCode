import React, { useState, useEffect, useMemo } from 'react';

const AssignWordsModal = ({ isOpen, onClose, classId, onWordsAssigned, assignedWords = [] }) => {
  const [tab, setTab] = useState('assign'); // 'assign' | 'history'
  const [assignMode, setAssignMode] = useState('wordbook'); // 'wordbook' | 'list'
  const [step, setStep] = useState(1); // 1: select wordbook, 2: select words
  const [wordbooks, setWordbooks] = useState([]);
  const [selectedWordbook, setSelectedWordbook] = useState(null);
  const [words, setWords] = useState([]);
  const [selectedWords, setSelectedWords] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideAssigned, setHideAssigned] = useState(true);
  const [classAssignedWords, setClassAssignedWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  // Assign via pasted list (must be declared before any return)
  const [listText, setListText] = useState('');
  const [listSubmitting, setListSubmitting] = useState(false);

  const assignedWordsSet = useMemo(
    () => new Set((classAssignedWords && classAssignedWords.length > 0) ? classAssignedWords : assignedWords),
    [classAssignedWords, assignedWords]
  );

  useEffect(() => {
    if (!isOpen || tab !== 'assign' || assignMode !== 'wordbook') return;
    setLoading(true);
    const run = async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch('/api/wordbooks', { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error('Failed to load wordbooks');
        setWordbooks(await resp.json());
        if (classId) {
          try {
            const repRes = await fetch(`/api/classes/${classId}/assigned-vocab`, { headers: { Authorization: `Bearer ${token}` } });
            if (repRes.ok) {
              const repData = await repRes.json();
              setClassAssignedWords(Array.isArray(repData.combined) ? repData.combined : []);
            }
          } catch (_) {}
        }
      } catch (e) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isOpen, tab, classId, assignMode]);

  useEffect(() => {
    if (!isOpen || tab !== 'history') return;
    const loadHistory = async () => {
      setHistoryError('');
      setHistoryLoading(true);
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/classes/${classId}/assignment-history`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.message || 'Failed to load class assignment history');
        setHistory(Array.isArray(data) ? data : []);
      } catch (e) {
        setHistoryError(e?.message || 'Failed to load history');
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, [isOpen, tab, classId]);

  useEffect(() => {
    if (!isOpen || tab !== 'assign' || assignMode !== 'wordbook' || !selectedWordbook) return;
    setLoading(true);
    const run = async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/wordbooks/${selectedWordbook._id}?limit=0`, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error('Failed to load words');
        const data = await resp.json();
        const list = Array.isArray(data.entries) ? data.entries : [];
        const unique = new Set();
        list.forEach(w => (w.tags || []).forEach(t => unique.add(t)));
        list.sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
        setWords(list);
        setAllTags(['', ...Array.from(unique).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))]);
        setStep(2);
      } catch (e) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isOpen, tab, assignMode, selectedWordbook]);

  const filteredWords = useMemo(() => {
    const result = words.filter(word => {
      if (hideAssigned && assignedWordsSet.has(word.word)) return false;
      const tagMatch = selectedTag ? (word.tags || []).includes(selectedTag) : true;
      const searchMatch = searchQuery ? (word.word || '').toLowerCase().includes(searchQuery.toLowerCase()) : true;
      return tagMatch && searchMatch;
    });
    return result.sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
  }, [words, selectedTag, searchQuery, hideAssigned, assignedWordsSet]);

  if (!isOpen) return null;

  const areAllFilteredWordsSelected = () => filteredWords.length > 0 && filteredWords.every(w => selectedWords.includes(w.word));
  const handleSelectAll = () => {
    const names = filteredWords.map(w => w.word);
    if (areAllFilteredWordsSelected()) {
      setSelectedWords(prev => prev.filter(n => !names.includes(n)));
    } else {
      setSelectedWords(prev => [...new Set([...prev, ...names])]);
    }
  };
  const handleSelectWord = (name) => setSelectedWords(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const handleSubmit = async () => {
    if (selectedWords.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/classes/${classId}/assign-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: selectedWords })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || 'Assignment failed');
      onWordsAssigned?.(data?.message || 'Assigned');
      handleClose();
    } catch (e) {
      setError(e?.message || 'Assignment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitList = async () => {
    const words = (listText || '').split(/[\s,\n]+/).map(s=>s.trim()).filter(Boolean);
    if (words.length === 0) { alert('Please enter words'); return; }
    setListSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/classes/${classId}/assign-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words })
      });
      const data = await resp.json().catch(()=>({}));
      if (!resp.ok) throw new Error(data?.message || 'Assignment failed');
      onWordsAssigned?.(data?.message || 'Assigned');
      handleClose();
    } catch (e) {
      alert(e?.message || 'Assignment failed');
    } finally {
      setListSubmitting(false);
    }
  };

  const handleClose = () => {
    setTab('assign');
    setStep(1);
    setSelectedWordbook(null);
    setWords([]);
    setSelectedWords([]);
    setAllTags([]);
    setSelectedTag('');
    setSearchQuery('');
    setHideAssigned(true);
    setClassAssignedWords([]);
    setError(null);
    setHistory([]);
    setHistoryError('');
    setHistoryLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-4/5 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`px-3 py-1.5 rounded ${tab==='assign' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setTab('assign')}>Assign to Class</button>
            <button className={`px-3 py-1.5 rounded ${tab==='history' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setTab('history')}>Class Assignment History</button>
          </div>
          {tab==='assign' && (
            <h2 className="text-xl font-bold text-gray-800">Assign Words</h2>
          )}
          {tab==='history' && (
            <h2 className="text-xl font-bold text-gray-800">Class Assignment History</h2>
          )}
        </div>

        {tab==='assign' && error && <div className="px-6 pt-2 text-red-500">{error}</div>}
        {tab==='history' && historyError && <div className="px-6 pt-2 text-red-500">{historyError}</div>}

        <div className="p-6 overflow-y-auto flex-grow">
          {tab==='assign' && (
            <>
              {/* Mode toggle: by wordbook vs by list */}
              <div className="mb-4 flex items-center gap-2">
                <button className={`px-3 py-1.5 rounded ${assignMode==='wordbook'?'bg-blue-600 text-white':'bg-gray-100 text-gray-700'}`} onClick={()=>{ setAssignMode('wordbook'); }}>By Wordbook</button>
                <button className={`px-3 py-1.5 rounded ${assignMode==='list'?'bg-blue-600 text-white':'bg-gray-100 text-gray-700'}`} onClick={()=>{ setAssignMode('list'); }}>Assign List</button>
              </div>

              {assignMode==='wordbook' && (
                <>
                  {loading && <p>Loading...</p>}
                  {step === 1 && !loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {wordbooks.map(wb => (
                        <div key={wb._id} onClick={() => setSelectedWordbook(wb)} className="p-4 rounded-lg cursor-pointer border-2 hover:border-blue-500 hover:bg-blue-50">
                          <h3 className="font-bold text-lg">{wb.title}</h3>
                          <p className="text-sm text-gray-600">{wb.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {step === 2 && !loading && (
                    <>
                      <div className="mb-4 flex flex-wrap items-center gap-4">
                        <div>
                          <label htmlFor="search-word" className="block text-sm font-medium text-gray-700 mb-1">Search words</label>
                          <input id="search-word" type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Type a word..." className="w-full md:w-48 p-2 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                        <div>
                          <label htmlFor="tag-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by tag</label>
                          <select id="tag-filter" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="w-full md:w-48 p-2 border border-gray-300 rounded-md shadow-sm">
                            {allTags.map((tag, idx) => (
                              <option key={idx} value={tag}>{tag === '' ? 'All tags' : tag}</option>
                            ))}
                          </select>
                        </div>
                        <div className="self-end">
                          <button onClick={handleSelectAll} className="p-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={filteredWords.length === 0}>
                            {areAllFilteredWordsSelected() ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                        <div className="self-end flex items-center">
                          <input type="checkbox" id="hide-assigned" checked={hideAssigned} onChange={(e) => setHideAssigned(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <label htmlFor="hide-assigned" className="ml-2 text-sm text-gray-700">Hide already assigned (class representative)</label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filteredWords.map(word => (
                          <div key={word.word} onClick={() => handleSelectWord(word.word)} className={`p-3 rounded-lg cursor-pointer border-2 ${selectedWords.includes(word.word) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} ${assignedWordsSet.has(word.word) ? 'bg-gray-100' : ''}`}>
                            <p className="font-semibold">{word.word}</p>
                            <p className="text-sm text-gray-500">{word.definition_cn}</p>
                            {assignedWordsSet.has(word.word) && <span className="text-xs text-gray-500">(Assigned)</span>}
                            <div className="mt-2">
                              {(word.tags || []).map(tag => (
                                <span key={tag} className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full mr-1">{tag}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {assignMode==='list' && (
                <div className="space-y-3">
                  <label className="block text-sm text-gray-700">Words (comma, space, or newline separated)</label>
                  <textarea value={listText} onChange={e=>setListText(e.target.value)} placeholder="apple, banana, ... or one per line" className="w-full p-3 border rounded min-h-[140px]" />
                  <div className="text-right">
                    <button onClick={handleSubmitList} disabled={listSubmitting} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">{listSubmitting ? 'Assigning...' : 'Assign to Class'}</button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab==='history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">View recent class assignments</div>
              <button className="px-3 py-1.5 bg-gray-200 rounded" onClick={() => { setTab('assign'); setTimeout(() => setTab('history'), 0); }} disabled={historyLoading}>Refresh</button>
              </div>
              {historyLoading && <p>Loading history...</p>}
              {!historyLoading && history.length === 0 && <p className="text-gray-500">No history yet</p>}
              <ul className="space-y-3">
                {history.map((h, idx) => (
                  <li key={idx} className="border rounded p-3">
                    <div className="font-semibold mb-1">{h.date}</div>
                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(h.words) && h.words.map(w => (
                        <span key={w} className="px-2 py-0.5 bg-gray-100 rounded border text-sm">{w}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-between items-center bg-gray-50">
          <div>
            {tab==='assign' && assignMode==='wordbook' && step === 2 && (
              <button onClick={() => setStep(1)} className="py-2 px-4 bg-gray-200 rounded-lg">Back to wordbooks</button>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={handleClose} className="py-2 px-4 bg-gray-200 rounded-lg">Close</button>
            {tab==='assign' && assignMode==='wordbook' && step === 2 && (
              <button onClick={() => setShowConfirm(true)} className="py-2 px-6 bg-blue-600 text-white rounded-lg" disabled={loading || selectedWords.length === 0}>{loading ? 'Assigning...' : `Assign ${selectedWords.length} words to class`}</button>
            )}
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-60">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold text-gray-800">Confirm assignment?</h3>
              <p className="text-sm text-gray-600 mt-1">Total {selectedWords.length} words</p>
            </div>
            <div className="p-6 overflow-y-auto">
              {selectedWords.length === 0 ? (
                <p className="text-gray-500">No words selected.</p>
              ) : (
                <ul className="list-disc list-inside space-y-1">
                  {selectedWords.map(w => (
                    <li key={w} className="text-gray-800">{w}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-4 bg-gray-50">
              <button onClick={() => setShowConfirm(false)} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300" disabled={loading}>Cancel</button>
              <button onClick={async () => { await handleSubmit(); setShowConfirm(false); }} className="py-2 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300" disabled={loading || selectedWords.length === 0}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignWordsModal;
