import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

// NOTE: UI-only implementation. Backend endpoints are expected but not required here.
// This page follows developer_notes.txt constraints and mirrors the referenced UI as closely as possible
// without TypeScript and external datepicker dependencies.

const API = '/api';

// --- Time helpers: represent publish time in Asia/Shanghai regardless of user locale ---
const isoToShanghaiInput = (iso) => {
  try {
    const ms = Date.parse(iso);
    if (isNaN(ms)) return '';
    const shMs = ms + 8 * 60 * 60 * 1000; // China Standard Time (no DST)
    return new Date(shMs).toISOString().slice(0, 16);
  } catch (_) { return ''; }
};

const shanghaiInputToISO = (input) => {
  // input format: YYYY-MM-DDTHH:mm, interpret as Asia/Shanghai local
  try {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return '';
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const utcMs = Date.UTC(y, mo - 1, d, h, mi) - 8 * 60 * 60 * 1000; // convert Shanghai -> UTC
    return new Date(utcMs).toISOString();
  } catch (_) { return ''; }
};

const authFetch = async (url, opts={}) => {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(opts.body && !opts.headers?.['Content-Type'] && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    }
  });
  return res;
};

// ---- Modal: Manage Word Pools ----
const WordPoolModal = ({
  onClose,
  wordPools,
  selectedPoolId,
  setSelectedPoolId,
  loading,
  loadingWords,
  wordsInSelectedPool,
  showUsedWords,
  setShowUsedWords,
  newPoolName,
  setNewPoolName,
  newPoolDescription,
  setNewPoolDescription,
  createPool,
  deletePool,
  updateWordStatus,
  delWord,
  newWord,
  setNewWord,
  addWord,
  importFile,
  setImportFile,
  importTxt
}) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Manage Word Lists</h2>
        <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-gray-800">×</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold text-lg">All Word Lists</h3>
          <div className="mt-2 border rounded-lg max-h-60 overflow-y-auto divide-y">
            {wordPools.map(pool => (
              <div key={pool.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium">{pool.name}</div>
                  <div className="text-sm text-gray-500">{pool.description || ''}</div>
                </div>
                <button onClick={() => deletePool(pool.id)} className="text-red-600 hover:underline text-sm">Delete</button>
              </div>
            ))}
            {wordPools.length === 0 && <div className="p-3 text-gray-500">No pools yet.</div>}
          </div>
          <div className="mt-6 border-t pt-4">
          <h4 className="font-semibold text-lg">Create New List</h4>
            <div className="mt-2 space-y-2">
              <input className="border p-2 rounded w-full" placeholder="New pool name..." value={newPoolName} onChange={e=>setNewPoolName(e.target.value)} />
              <input className="border p-2 rounded w-full" placeholder="Description (optional)..." value={newPoolDescription} onChange={e=>setNewPoolDescription(e.target.value)} />
              <button onClick={createPool} className="px-4 py-2 bg-green-700 text-white rounded disabled:opacity-50" disabled={!newPoolName.trim()}>Create Pool</button>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-lg">Manage Words In:</h3>
          <select className="border p-2 rounded w-full mt-2" value={selectedPoolId || ''} onChange={e=>setSelectedPoolId(e.target.value)} disabled={loading}>
            {loading ? <option>Loading...</option> : wordPools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
          </select>
          {selectedPoolId && (
            <>
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showUsedWords} onChange={e=>setShowUsedWords(e.target.checked)} />
                  <span>Show Used Words</span>
                </label>
              </div>
              <div className="mt-2 max-h-60 overflow-y-auto border rounded p-2 bg-gray-50">
                {loadingWords ? (
                  <div>Loading...</div>
                ) : (
                  wordsInSelectedPool.map(w => (
                    <div key={w.id} className="flex items-center justify-between p-1 hover:bg-gray-100 rounded">
                      <span>{w.word} (<span className={w.status === 'new' ? 'text-green-600' : 'text-gray-500'}>{w.status}</span>)</span>
                      <div className="space-x-2 text-sm">
                        {w.status === 'new' ? (
                          <button onClick={()=>updateWordStatus(w.id,'used')} className="text-yellow-700 hover:underline">Mark Used</button>
                        ) : (
                          <button onClick={()=>updateWordStatus(w.id,'new')} className="text-blue-700 hover:underline">Mark New</button>
                        )}
                        <button onClick={()=>delWord(w.id, w.word)} className="text-red-600 hover:underline">Delete</button>
                      </div>
                    </div>
                  ))
                )}
                {(!loadingWords && wordsInSelectedPool.length === 0) && <div className="text-gray-500">No words.</div>}
              </div>
              <div className="mt-3">
                <h4 className="font-semibold">Add Word</h4>
                <div className="flex gap-2 mt-2">
                  <input className="border p-2 rounded flex-1" placeholder="New word..." value={newWord} onChange={e=>setNewWord(e.target.value)} />
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50" disabled={!newWord.trim()} onClick={addWord}>Add</button>
                </div>
              </div>
              <div className="mt-4 border-t pt-3">
                <h4 className="font-semibold">Import from .txt</h4>
                <div className="flex gap-2 mt-2 items-center">
                  <input type="file" accept=".txt" onChange={e=>setImportFile(e.target.files ? e.target.files[0] : null)} />
                  <button className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50" disabled={!importFile} onClick={importTxt}>Import</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  </div>
);

// ---- Hint Modal ----
const HintModal = ({ words, hints, setHints, onConfirm, onCancel }) => {
  const [mode, setMode] = useState('hint'); // 'hint' | 'direct'
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Add Additional Info (Optional)</h2>
            <p className="text-sm text-gray-600 mt-1">
              {mode === 'hint' ? 'Provide a hint for ambiguous words.' : 'Enter POS and Meaning to bypass AI.'}
            </p>
          </div>
          <div className="flex rounded shadow-sm overflow-hidden">
            <button onClick={()=>setMode('hint')} className={`px-4 py-2 text-sm ${mode==='hint'?'bg-blue-600 text-white':'bg-white border'}`}>Hint Mode</button>
            <button onClick={()=>setMode('direct')} className={`px-4 py-2 text-sm ${mode==='direct'?'bg-blue-600 text-white':'bg-white border'}`}>Direct Mode</button>
          </div>
        </div>
        <div className="space-y-3">
          {words.map(word => (
            <div key={word} className="p-3 border rounded bg-gray-50">
              <div className="font-semibold mb-2">{word}</div>
              {mode === 'hint' ? (
                <input className="border p-2 rounded w-full" value={hints[word]?.hint || ''} onChange={e=>setHints({ ...hints, [word]: { ...(hints[word]||{}), hint: e.target.value, pos: '', meaning: '' } })} placeholder="Hint for AI (e.g., music, lock)" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="border p-2 rounded w-full" value={hints[word]?.pos || ''} onChange={e=>setHints({ ...hints, [word]: { ...(hints[word]||{}), pos: e.target.value, hint: '' } })} placeholder="POS (e.g., n.)" />
                  <input className="border p-2 rounded w-full" value={hints[word]?.meaning || ''} onChange={e=>setHints({ ...hints, [word]: { ...(hints[word]||{}), meaning: e.target.value, hint: '' } })} placeholder="Meaning" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-4 border-t pt-4">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-green-600 text-white rounded">Confirm & Generate</button>
        </div>
      </div>
    </div>
  );
};

const QuizTable = ({ quizzes, isDrafts, onEdit, onDelete, onUnpublish, onPublish, teacherClasses = [], onChangeClass }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-left border-collapse">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-3 border-b">Name</th>
          <th className="p-3 border-b">Type</th>
          <th className="p-3 border-b">Status</th>
          <th className="p-3 border-b">Publish At</th>
          <th className="p-3 border-b">Class</th>
          <th className="p-3 border-b">Items</th>
          <th className="p-3 border-b">Created</th>
          <th className="p-3 border-b">Actions</th>
        </tr>
      </thead>
      <tbody>
        {quizzes.map(q => (
          <tr key={q._id || q.id} className="border-b hover:bg-gray-50">
            <td className="p-3">{q.name}</td>
            <td className="p-3">{q.type}</td>
            <td className="p-3">
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${q.status==='published'?'bg-green-100 text-green-800':(q.status==='to be published'?'bg-blue-100 text-blue-800':'bg-yellow-100 text-yellow-800')}`}>{q.status}</span>
            </td>
            <td className="p-3">{q.publish_at || 'N/A'}</td>
            <td className="p-3">
              {isDrafts ? (
                <span className="text-gray-500">—</span>
              ) : (
                <select
                  className="border p-1 rounded"
                  value={(q.class_ids && q.class_ids[0]) || ''}
                  onChange={e => onChangeClass && onChangeClass(q, e.target.value)}
                >
                  {teacherClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </td>
            <td className="p-3">{Array.isArray(q?.data?.items)? q.data.items.length : (q.items_count || 0)}</td>
            <td className="p-3">{q.created_at ? new Date(q.created_at).toLocaleDateString() : ''}</td>
            <td className="p-3 space-x-2 whitespace-nowrap">
              <button onClick={()=>onEdit(q)} className="px-3 py-1 bg-yellow-500 text-white rounded text-sm">Edit</button>
              {isDrafts && onPublish && (
                <button onClick={()=>onPublish(q._id)} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Publish</button>
              )}
              {!isDrafts && onUnpublish && (
                <button onClick={()=>onUnpublish(q._id)} className="px-3 py-1 bg-gray-600 text-white rounded text-sm">Unpublish</button>
              )}
              <button onClick={()=>onDelete(q._id)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
              <a href={`/quiz/${q._id}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-600 text-white rounded text-sm inline-block">Take</a>
            </td>
          </tr>
        ))}
        {quizzes.length === 0 && (
          <tr><td className="p-3 text-gray-500" colSpan={8}>No data</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

const EditQuiz = ({ quiz, items, setItems, onFinish, onCancel, onRegenerate, onRegenerateDef }) => {
  const [quizName, setQuizName] = useState(quiz.name || '');
  const [status, setStatus] = useState(quiz.status || 'draft');
  const [publishAt, setPublishAt] = useState(quiz.publish_at || '');
  return (
    <div className="bg-white p-6 rounded shadow space-y-4">
      <h2 className="text-xl font-semibold">Editing Quiz: {quiz.name}</h2>
      <input className="border p-2 rounded w-full" value={quizName} onChange={e=>setQuizName(e.target.value)} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select className="border p-2 rounded w-full" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Publish At (optional)</label>
          <input type="datetime-local" className="border p-2 rounded w-full" value={publishAt ? new Date(publishAt).toISOString().slice(0,16) : ''} onChange={e=>setPublishAt(e.target.value ? new Date(e.target.value).toISOString() : '')} />
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
        {items.map((it,i) => (
          <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
            <div className="flex items-center justify-between">
              <strong className="text-lg">{i+1}. {it.word}</strong>
              <div className="space-x-3 text-sm">
                <label><input type="checkbox" checked={!!it.definition} onChange={e=>{const c=[...items]; c[i].definition=e.target.checked; setItems(c);}} /> Def</label>
                <label><input type="checkbox" checked={!!it.blank} onChange={e=>{const c=[...items]; c[i].blank=e.target.checked; setItems(c);}} /> Blank</label>
                <label><input type="checkbox" checked={!!it.sentence} onChange={e=>{const c=[...items]; c[i].sentence=e.target.checked; setItems(c);}} /> Sentence</label>
              </div>
            </div>
            {it.definition && (
              <div className="flex items-center gap-2">
                <textarea rows={1} className="border w-full p-1 rounded" value={it.def || ''} onChange={e=>{const c=[...items]; c[i].def=e.target.value; setItems(c);}} placeholder="Definition" />
                <button onClick={()=>onRegenerateDef(i)} className="px-2 py-1 text-sm bg-gray-200 rounded">Regen</button>
              </div>
            )}
            {it.blank && (
              <div className="flex items-center gap-2">
                <textarea rows={1} className="border w-full p-1 rounded" value={it.clue || ''} onChange={e=>{const c=[...items]; c[i].clue=e.target.value; setItems(c);}} placeholder="Fill-in-the-blank sentence" />
                <button onClick={()=>onRegenerate(i)} className="px-2 py-1 text-sm bg-gray-200 rounded">Regen</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={()=>onFinish(quizName, items, 'draft', publishAt)} className="px-6 py-2 bg-gray-600 text-white rounded">Save as Draft</button>
        <button onClick={()=>onFinish(quizName, items, 'published', publishAt)} className="px-6 py-2 bg-green-600 text-white rounded">Update Published Quiz</button>
        <button onClick={onCancel} className="px-6 py-2 bg-red-600 text-white rounded">Cancel</button>
      </div>
    </div>
  );
};

function QuizzesPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [wordPools, setWordPools] = useState([]); // Reusing variable name; sourced from /api/wordbooks
  const [selectedPoolId, setSelectedPoolId] = useState(null);
  const [wordsInSelectedPool, setWordsInSelectedPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingWords, setLoadingWords] = useState(false);

  // Form state
  const [mode, setMode] = useState('weekday'); // 'weekday'|'saturday'
  // Generation method tabs for weekday mode
  const [genTab, setGenTab] = useState('wordlist'); // 'wordlist' | 'direct'
  const [quizName, setQuizName] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [isPublishModalOpen, setPublishModalOpen] = useState(false);
  const [publishContext, setPublishContext] = useState(null); // 'new' | 'existing'
  const [publishQuizId, setPublishQuizId] = useState(null);
  const [weekdayCount, setWeekdayCount] = useState(10);
  const [saturdayBlankCount, setSaturdayBlankCount] = useState(5);
  const [saturdaySentenceCount, setSaturdaySentenceCount] = useState(5);
  const [customWords, setCustomWords] = useState(''); // used for direct input

  // Generation
  const [items, setItems] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isHintModalOpen, setHintModalOpen] = useState(false);
  const [wordHints, setWordHints] = useState({});
  const [wordsForHinting, setWordsForHinting] = useState([]);
  // Removed: assess-other-senses flow; default is current sense only

  // Pools management
  const [newWord, setNewWord] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolDescription, setNewPoolDescription] = useState('');
  const [showUsedWords, setShowUsedWords] = useState(false);
  const [isManagePoolsModalOpen, setManagePoolsModalOpen] = useState(false);

  // Editing
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editedItems, setEditedItems] = useState([]);

  const drafts = useMemo(() => quizzes.filter(q => (q.status === 'draft' || q.status === 'to be published')), [quizzes]);
  const publishedQuizzes = useMemo(() => quizzes.filter(q => q.status === 'published'), [quizzes]);

  const fetchQuizzes = async () => {
    try {
      const qRes = await authFetch(`${API}/quizzes`);
      if (qRes.ok) {
        const data = await qRes.json();
        if (data && Array.isArray(data.quizzes)) setQuizzes(data.quizzes);
        else if (Array.isArray(data)) setQuizzes(data);
        else setQuizzes([]);
      }
    } catch (_) {}
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [qRes, poolsRes, classesRes] = await Promise.all([
          authFetch(`${API}/quizzes`),
          authFetch(`${API}/admin/public-wordbooks`),
          authFetch(`${API}/classes`)
        ]);
        if (qRes.ok) {
          const data = await qRes.json();
          if (data && Array.isArray(data.quizzes)) setQuizzes(data.quizzes);
          else if (Array.isArray(data)) setQuizzes(data);
          else setQuizzes([]);
        }
        if (poolsRes.ok) {
          const books = await poolsRes.json();
          const mapped = (Array.isArray(books) ? books : []).map(b => ({ id: b._id, name: b.title, description: b.description }));
          setWordPools(mapped);
          if (!selectedPoolId && mapped.length > 0) setSelectedPoolId(mapped[0].id);
        }
        if (classesRes.ok) {
          const cls = await classesRes.json();
          const mappedCls = (Array.isArray(cls) ? cls : []).map(c => ({ id: c._id, name: c.name }));
          setTeacherClasses(mappedCls);
          if (!selectedClassId && mappedCls.length > 0) setSelectedClassId(mappedCls[0].id);
        }
      } catch (_) {}
      finally { setLoading(false); }
    };
    init();
  }, []);

  const fetchWordsForSelectedPool = async (poolId) => {
    if (!poolId) { setWordsInSelectedPool([]); return; }
    setLoadingWords(true);
    try {
      const url = `${API}/admin/wordbooks/${poolId}?limit=0`;
      const wRes = await authFetch(url);
      if (wRes.ok) {
        const data = await wRes.json();
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        // Map to the UI schema used earlier; treat all as 'new'. Keep CN definition if available.
        setWordsInSelectedPool(entries.map(e => ({ id: `${poolId}:${e.word}`, word: e.word, status: 'new', definition_cn: e.definition_cn || '' })));
      } else {
        setWordsInSelectedPool([]);
      }
    } catch (_) { setWordsInSelectedPool([]); }
    finally { setLoadingWords(false); }
  };

  useEffect(() => { if (selectedPoolId) fetchWordsForSelectedPool(selectedPoolId); }, [selectedPoolId, showUsedWords]);

  const sampleWords = (arr, n) => {
    const copy = [...arr];
    const out = [];
    const len = Math.min(n, copy.length);
    for (let i=0;i<len;i++) {
      const j = Math.floor(Math.random()*copy.length);
      out.push(copy[j]);
      copy.splice(j,1);
    }
    return out;
  };

  const handleGenerateSaturdayItems = async () => {
    if (saturdayBlankCount < 0 || saturdaySentenceCount < 0) { alert('Please enter a valid number.'); return; }
    if (saturdayBlankCount === 0 && saturdaySentenceCount === 0) { alert('Please request at least one question.'); return; }
    setGenerating(true); setItems([]);
    try {
      // Backend required. UI will simply reset list on success.
      const res = await authFetch(`${API}/quizzes/saturday-special`, { method: 'POST', body: JSON.stringify({ blank_count: saturdayBlankCount, sentence_count: saturdaySentenceCount }) });
      if (!res.ok) throw new Error('Failed to generate items.');
      const fetched = await res.json();
      const map = new Map();
      (Array.isArray(fetched)? fetched : []).forEach(it => {
        if (!map.has(it.word)) map.set(it.word, { word: it.word, blank: false, sentence: false, definition: false, clue: '', def: it.definition || '' });
        const ex = map.get(it.word);
        if (it.type === 'fill-in-the-blank') { ex.blank = true; ex.clue = it.sentence; }
        if (it.type === 'sentence') { ex.sentence = true; }
      });
      setItems(Array.from(map.values()));
    } catch (e) {
      alert(e.message || 'Error');
    } finally { setGenerating(false); }
  };

  const handleGenerateItems = () => {
    let list = [];
    if (mode === 'weekday') {
      if (genTab === 'wordlist') {
        if (!selectedPoolId) { alert('Please select a word pool.'); return; }
        const newWords = wordsInSelectedPool.filter(w => w.status === 'new').map(w => w.word);
        if (newWords.length < weekdayCount) { alert(`Not enough NEW words in pool (have ${newWords.length}, need ${weekdayCount})`); return; }
        list = sampleWords(newWords, weekdayCount);
      } else {
        // Direct input: one word per line
        list = customWords.split(/\r?\n/).map(w=>w.trim()).filter(Boolean);
        if (list.length === 0) { alert('Please enter at least one word'); return; }
      }
    }
    if (list.length > 0) {
      setWordsForHinting(list);
      setWordHints({});
      setHintModalOpen(true);
    }
  };

  const regenerateSentence = async (idx) => {
    const arr = [...items];
    const it = arr[idx]; if (!it) return;
    it.clue = '(regenerating...)'; setItems(arr);
    try {
      const res = await authFetch(`${API}/ai/fill-blanks`, { method: 'POST', body: JSON.stringify({ word: it.word, definition: it.def || '' }) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      it.clue = data.sentence || '(error)';
    } catch (e) { it.clue = `(error: ${e.message})`; }
    finally { setItems([...arr]); }
  };

  const regenerateDefinition = async (idx) => {
    const arr = [...items];
    const it = arr[idx]; if (!it) return;
    it.def = '(regenerating...)'; setItems(arr);
    try {
      const payload = { word: it.word };
      const res = await authFetch(`${API}/ai/definition`, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      it.def = data.definition || '(error)';
    } catch (e) { it.def = `(error: ${e.message})`; }
    finally { setItems([...arr]); }
  };

  const regenerateEditedSentence = async (idx) => {
    const arr = [...editedItems];
    const it = arr[idx]; if (!it) return;
    it.clue = '(regenerating...)'; setEditedItems(arr);
    try {
      const res = await authFetch(`${API}/ai/fill-blanks`, { method: 'POST', body: JSON.stringify({ word: it.word, definition: it.def || '' }) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      it.clue = data.sentence || '(error)';
    } catch (e) { it.clue = `(error: ${e.message})`; }
    finally { setEditedItems([...arr]); }
  };

  const regenerateEditedDefinition = async (idx) => {
    const arr = [...editedItems];
    const it = arr[idx]; if (!it) return;
    it.def = '(regenerating...)'; setEditedItems(arr);
    try {
      const res = await authFetch(`${API}/ai/definition`, { method: 'POST', body: JSON.stringify({ word: it.word }) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      it.def = data.definition || '(error)';
    } catch (e) { it.def = `(error: ${e.message})`; }
    finally { setEditedItems([...arr]); }
  };

  // Create quiz with explicit class id when publishing
  const createQuizWithClass = async (status, clsId) => {
    if (!quizName.trim()) { alert('Quiz name is required'); return; }
    if (items.length === 0) { alert('Generate items first'); return; }
    const payloadItems = [];
    items.forEach(it => {
      if (it.blank) payloadItems.push({ type: 'fill-in-the-blank', word: it.word, definition: it.definition ? it.def : '', sentence: it.clue });
      if (it.sentence) payloadItems.push({ type: 'sentence', word: it.word, definition: it.definition ? it.def : '' });
    });
    if (payloadItems.length === 0) { alert('You must include at least one question per word'); return; }
    if (status === 'published' && !clsId) { setPublishContext('new'); setPublishModalOpen(true); return; }
    const payload = {
      name: quizName,
      type: mode,
      data: { items: payloadItems },
      pool_id: selectedPoolId,
      status,
      publish_at: publishAt || null,
      class_ids: status === 'published' ? [clsId] : []
    };
    try {
      const res = await authFetch(`${API}/quizzes`, { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        alert(status === 'draft' ? 'Saved draft' : 'Published');
        setQuizName(''); setItems([]); setCustomWords(''); setProgress(0); setPublishAt('');
        fetchQuizzes(); if (mode==='weekday' && selectedPoolId) fetchWordsForSelectedPool(selectedPoolId);
      } else alert((await res.json()).error || 'Create failed');
    } catch (e) { alert(e.message || 'Create failed'); }
  };

  const createQuiz = async (status) => {
    const cid = selectedClassId || (teacherClasses[0]?.id || '');
    return createQuizWithClass(status, cid);
  };

  // --- Publish helpers ---
  const startPublishNewQuiz = () => {
    const cid = selectedClassId || (teacherClasses[0]?.id || '');
    if (!cid) {
      setPublishContext('new');
      setPublishModalOpen(true);
      return;
    }
    createQuizWithClass('published', cid);
  };

  const startGenerationProcess = async (hints) => {
    setHintModalOpen(false);
    const list = wordsForHinting;
    const its = list.map(w => ({ word: w, blank: true, sentence: false, definition: mode==='weekday', clue: '(pending...)', def: '(generating...)' }));
    if (mode === 'weekday') {
      const idx = Array.from({length: its.length}, (_,i)=>i);
      const pick = its.length <= 5 ? idx : sampleWords(idx, 5);
      pick.forEach(i => { its[i].sentence = true; });
    }
    setItems(its); setProgress(0); setGenerating(true);

    const newItems = [...its];
    // Definitions: prefer wordbook; use AI only if teacher provided additional info
    const posAbbr = (posRaw) => {
      if (!posRaw) return '';
      const p = String(posRaw).toLowerCase();
      if (p.startsWith('n')) return 'n.';
      if (p.startsWith('v')) return 'v.';
      if (p.startsWith('adj')) return 'adj.';
      if (p.startsWith('adv')) return 'adv.';
      if (p.startsWith('pron')) return 'pron.';
      if (p.startsWith('prep')) return 'prep.';
      if (p.startsWith('conj')) return 'conj.';
      if (p.startsWith('interj')) return 'interj.';
      if (p.startsWith('det')) return 'det.';
      if (p.startsWith('art')) return 'art.';
      return p;
    };
    for (let i=0;i<newItems.length;i++) {
      if (mode === 'weekday') {
        try {
          const w = newItems[i].word;
          const h = hints[w];
          if (h?.pos && h?.meaning) {
            newItems[i].def = `${h.pos} ${h.meaning}`;
          } else if (h?.hint) {
            const payload = { word: w, hint: h.hint };
            const res = await authFetch(`${API}/ai/definition`, { method: 'POST', body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            newItems[i].def = data.definition || '';
          } else {
            // Try to fetch from words API (wordbook source)
            try {
              const res = await authFetch(`${API}/words/practice/${encodeURIComponent(w)}`);
              if (res.ok) {
                const wd = await res.json();
                // Prefer the English definition from DB, and append Cambridge note
                const en = (wd.definition_en || '').trim();
                const cambridgeNote = ' (there are also other definitions, see Cambridge Dictionary)';
                newItems[i].def = en ? `${en}${cambridgeNote}` : '';
              } else {
                // fallback empty def
                newItems[i].def = '';
              }
            } catch (_) {
              newItems[i].def = '';
            }
          }
        } catch (e) { newItems[i].def = `(error: ${e.message})`; }
      } else { newItems[i].def = ''; }
      setItems([...newItems]); setProgress(p=>p+1);
    }
    setProgress(0);
    // Sentences
    for (let i=0;i<newItems.length;i++) {
      try {
        const res = await authFetch(`${API}/ai/fill-blanks`, { method: 'POST', body: JSON.stringify({ word: newItems[i].word, definition: newItems[i].def }) });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        newItems[i].clue = data.sentence || '(error)';
      } catch (e) { newItems[i].clue = `(error: ${e.message})`; }
      setItems([...newItems]); setProgress(p=>p+1);
    }
    setGenerating(false);
  };

  // removed duplicate createQuiz definition (now defined earlier to delegate to createQuizWithClass)

  const handleFinishEditing = async (newName, editedItemsArr, status, publishAtIso) => {
    if (!editingQuiz) return;
    const payloadItems = [];
    editedItemsArr.forEach(it => {
      if (it.blank) payloadItems.push({ type: 'fill-in-the-blank', word: it.word, definition: it.definition ? it.def : '', sentence: it.clue });
      if (it.sentence) payloadItems.push({ type: 'sentence', word: it.word, definition: it.definition ? it.def : '' });
    });
    if (payloadItems.length === 0) { alert('You must include at least one question per word'); return; }
    const payload = { name: newName, data: { items: payloadItems }, status, publish_at: publishAtIso || null };
    try {
      const res = await authFetch(`${API}/quizzes/${editingQuiz._id}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (res.ok) { alert('Quiz updated'); setEditingQuiz(null); setEditedItems([]); fetchQuizzes(); }
      else alert((await res.json()).error || 'Update failed');
    } catch (e) { alert(e.message || 'Update failed'); }
  };

  const handleEdit = (quiz) => {
    setEditingQuiz(quiz);
    const map = new Map();
    (quiz?.data?.items || []).forEach(qi => {
      if (!map.has(qi.word)) map.set(qi.word, { word: qi.word, blank: false, sentence: false, definition: false, clue: '', def: '' });
      const it = map.get(qi.word);
      if (qi.type === 'fill-in-the-blank') { it.blank = true; it.clue = qi.sentence; }
      if (qi.type === 'sentence') { it.sentence = true; }
      if (qi.definition) { it.definition = true; it.def = qi.definition; }
    });
    setEditedItems(Array.from(map.values()));
    window.scrollTo(0,0);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this quiz?')) return;
    try {
      const res = await authFetch(`${API}/quizzes/${id}`, { method: 'DELETE' });
      if (res.ok) fetchQuizzes(); else alert((await res.json()).error || 'Delete failed');
    } catch (e) { alert(e.message || 'Delete failed'); }
  };

  const doPublishExisting = async (id, clsId) => {
    try {
      const res = await authFetch(`${API}/quizzes/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'published', publish_at: null, class_ids: [clsId] }) });
      if (res.ok) fetchQuizzes(); else alert((await res.json()).error || 'Publish failed');
    } catch (e) { alert(e.message || 'Publish failed'); }
  };
  const handlePublish = async (id) => {
    // Always ask to confirm class when publishing a draft
    setPublishContext('existing');
    setPublishQuizId(id);
    setPublishModalOpen(true);
  };
  const handleUnpublish = async (id) => {
    try {
      const res = await authFetch(`${API}/quizzes/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'draft' }) });
      if (res.ok) fetchQuizzes(); else alert((await res.json()).error || 'Unpublish failed');
    } catch (e) { alert(e.message || 'Unpublish failed'); }
  };

  const updateQuizClass = async (quiz, clsId) => {
    if (!clsId) return;
    try {
      const res = await authFetch(`${API}/quizzes/${quiz._id}`, { method: 'PUT', body: JSON.stringify({ class_ids: [clsId] }) });
      if (res.ok) {
        fetchQuizzes();
      } else {
        const j = await res.json().catch(()=>({}));
        alert(j.error || 'Failed to update class');
      }
    } catch (e) { alert(e.message || 'Failed to update class'); }
  };

  const createPool = async () => {
    if (!newPoolName.trim()) return;
    try {
      const res = await authFetch(`${API}/admin/wordpools`, { method: 'POST', body: JSON.stringify({ name: newPoolName, description: newPoolDescription }) });
      if (res.ok) {
        const p = await res.json();
        const next = [...wordPools, p].sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        setWordPools(next);
        setSelectedPoolId(p.id);
        setNewPoolName(''); setNewPoolDescription('');
      } else alert((await res.json()).error || 'Failed to create pool');
    } catch (e) { alert(e.message || 'Failed to create pool'); }
  };
  const deletePool = async (poolId) => {
    const pool = wordPools.find(p => p.id === poolId);
    if (!pool) return;
    if (!window.confirm(`Delete pool "${pool.name}"? This will also delete its words.`)) return;
    try {
      const res = await authFetch(`${API}/admin/wordpools/${poolId}`, { method: 'DELETE' });
      if (res.ok) {
        const rest = wordPools.filter(p => p.id !== poolId);
        setWordPools(rest);
        if (selectedPoolId === poolId) setSelectedPoolId(rest.length > 0 ? rest[0].id : null);
      } else alert((await res.json()).error || 'Failed to delete pool');
    } catch (e) { alert(e.message || 'Failed to delete pool'); }
  };
  const updateWordStatus = async (wordId, status) => {
    try {
      const res = await authFetch(`${API}/admin/words/${wordId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      if (res.ok) fetchWordsForSelectedPool(selectedPoolId); else alert((await res.json()).error || 'Failed to update word');
    } catch (e) { alert(e.message || 'Failed to update word'); }
  };
  const addWord = async () => {
    if (!newWord.trim() || !selectedPoolId) return;
    try {
      const r = await authFetch(`${API}/admin/words`, { method: 'POST', body: JSON.stringify({ word: newWord.trim(), pool_id: selectedPoolId }) });
      if (r.ok) { setNewWord(''); fetchWordsForSelectedPool(selectedPoolId); }
      else alert((await r.json()).error || 'Failed');
    } catch (e) { alert(e.message || 'Failed'); }
  };
  const delWord = async (wordId, wordStr) => {
    if (!selectedPoolId || !window.confirm(`Delete "${wordStr}"?`)) return;
    try {
      const r = await authFetch(`${API}/admin/words/${wordId}?pool_id=${selectedPoolId}`, { method: 'DELETE' });
      if (r.ok) fetchWordsForSelectedPool(selectedPoolId); else alert((await r.json()).error || 'Failed');
    } catch (e) { alert(e.message || 'Failed'); }
  };
  const importTxt = async () => {
    if (!importFile || !selectedPoolId) return;
    const fd = new FormData(); fd.append('file', importFile); fd.append('pool_id', selectedPoolId);
    try {
      const r = await authFetch(`${API}/admin/words/import`, { method: 'POST', body: fd });
      const j = await r.json().catch(()=>({}));
      alert(j.message || j.error || 'Done');
      if (r.ok) { setImportFile(null); fetchWordsForSelectedPool(selectedPoolId); }
    } catch (e) { alert(e.message || 'Import failed'); }
  };

  return (
    <main className="p-6 bg-gray-50 space-y-8 min-h-screen">
      {isPublishModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-3">Select Class to Publish</h3>
            <select className="border p-2 rounded w-full" value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)}>
              {teacherClasses.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <div className="flex justify-end gap-3 mt-4">
              <button className="px-4 py-2 bg-gray-600 text-white rounded" onClick={()=>{ setPublishModalOpen(false); setPublishContext(null); setPublishQuizId(null); }}>Cancel</button>
              <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={async ()=>{
                const cid = selectedClassId || (teacherClasses[0]?.id || '');
                if (!cid) { alert('Please select a class.'); return; }
                setPublishModalOpen(false);
                if (publishContext === 'new') {
                  await createQuizWithClass('published', cid);
                } else if (publishContext === 'existing' && publishQuizId) {
                  await doPublishExisting(publishQuizId, cid);
                  setPublishQuizId(null);
                }
                setPublishContext(null);
              }}>Publish</button>
            </div>
          </div>
        </div>
      )}
      {/* Removed: assess-other-senses modal; default is to assess current sense only */}
      {isManagePoolsModalOpen && (
        <WordPoolModal
          onClose={() => setManagePoolsModalOpen(false)}
          wordPools={wordPools}
          selectedPoolId={selectedPoolId}
          setSelectedPoolId={setSelectedPoolId}
          loading={loading}
          loadingWords={loadingWords}
          wordsInSelectedPool={wordsInSelectedPool}
          showUsedWords={showUsedWords}
          setShowUsedWords={setShowUsedWords}
          newPoolName={newPoolName}
          setNewPoolName={setNewPoolName}
          newPoolDescription={newPoolDescription}
          setNewPoolDescription={setNewPoolDescription}
          createPool={createPool}
          deletePool={deletePool}
          updateWordStatus={updateWordStatus}
          delWord={delWord}
          newWord={newWord}
          setNewWord={setNewWord}
          addWord={addWord}
          importFile={importFile}
          setImportFile={setImportFile}
          importTxt={importTxt}
        />
      )}
      {isHintModalOpen && (
        <HintModal
          words={wordsForHinting}
          hints={wordHints}
          setHints={setWordHints}
          onConfirm={() => startGenerationProcess(wordHints)}
          onCancel={() => setHintModalOpen(false)}
        />
      )}
      <h1 className="text-3xl font-bold">Quiz Management</h1>

      {editingQuiz ? (
        <EditQuiz
          quiz={editingQuiz}
          items={editedItems}
          setItems={setEditedItems}
          onFinish={handleFinishEditing}
          onCancel={() => { setEditingQuiz(null); setEditedItems([]); }}
          onRegenerate={regenerateEditedSentence}
          onRegenerateDef={regenerateEditedDefinition}
        />
      ) : (
        <>
          <section className="space-y-6">
            <div className="bg-white p-6 rounded shadow space-y-4">
              <h2 className="text-xl font-semibold">Create New Quiz</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input className="border p-2 rounded md:col-span-3" placeholder="Quiz Name" value={quizName} onChange={e=>setQuizName(e.target.value)} />
                <div>
                  <label className="block text-sm font-medium">Quiz Type</label>
                  <select className="border p-2 rounded w-full" value={mode} onChange={e=>{ setMode(e.target.value); setItems([]); }}>
                    <option value="weekday">Weekday</option>
                    <option value="saturday">Saturday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">Publish At (Shanghai, optional)</label>
                  <input
                    type="datetime-local"
                    className="border p-2 rounded w-full"
                    value={publishAt ? isoToShanghaiInput(publishAt) : ''}
                    onChange={e=>setPublishAt(e.target.value ? shanghaiInputToISO(e.target.value) : '')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Publish to Class</label>
                  <select className="border p-2 rounded w-full" value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)}>
                    {teacherClasses.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Choose a class; you can also pick when publishing.</p>
                </div>
              </div>
              {mode==='weekday' && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  <div className="inline-flex rounded overflow-hidden border">
                    <button onClick={()=>setGenTab('wordlist')} className={`px-4 py-2 text-sm ${genTab==='wordlist' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Generate from word list</button>
                    <button onClick={()=>setGenTab('direct')} className={`px-4 py-2 text-sm ${genTab==='direct' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Generate from direct input</button>
                  </div>
                  {genTab === 'wordlist' ? (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium">Word List</label>
                          <select className="border p-2 rounded w-full mt-1" value={selectedPoolId || ''} onChange={e=>setSelectedPoolId(e.target.value)} disabled={loading}>
                            {loading ? <option>Loading...</option> : wordPools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-end gap-4">
                        <div>
                          <label className="block text-sm font-medium">Number of Words</label>
                          <input type="number" min={1} className="border p-2 w-24 rounded mt-1" value={weekdayCount} onChange={e=>setWeekdayCount(Number(e.target.value||0))} />
                        </div>
                        <button onClick={handleGenerateItems} disabled={generating || !selectedPoolId || loadingWords} className="bg-blue-600 text-white px-5 py-2 rounded disabled:bg-gray-400">
                          {generating ? `Generating... ${progress}/${items.length}` : 'Generate Items'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium">Enter words (one per line)</label>
                        <textarea rows={6} className="border w-full p-2 rounded mt-1" placeholder={"e.g.\napple\nbanana\ncat"} value={customWords} onChange={e=>setCustomWords(e.target.value)} />
                      </div>
                      <button onClick={handleGenerateItems} disabled={generating} className="bg-blue-600 text-white px-5 py-2 rounded disabled:bg-gray-400">
                        {generating ? `Generating... ${progress}/${items.length}` : 'Generate Items'}
                      </button>
                    </>
                  )}
                </div>
              )}
              {mode==='saturday' && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  <div className="flex items-end gap-4">
                    <div>
                      <label className="block text-sm font-medium">Number of Fill-in-the-blank</label>
                      <input type="number" min={0} className="border p-2 w-40 rounded mt-1" value={saturdayBlankCount} onChange={e=>setSaturdayBlankCount(Number(e.target.value||0))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Number of Sentences</label>
                      <input type="number" min={0} className="border p-2 w-40 rounded mt-1" value={saturdaySentenceCount} onChange={e=>setSaturdaySentenceCount(Number(e.target.value||0))} />
                    </div>
                    <button onClick={handleGenerateSaturdayItems} disabled={generating} className="bg-purple-600 text-white px-5 py-2 rounded disabled:bg-gray-400">{generating ? 'Generating...' : 'Generate From Past 5 Days'}</button>
                  </div>
                </div>
              )}
              {items.length > 0 && (
                <div className="space-y-4 mt-6 pt-4 border-t">
                  <h3 className="text-lg font-semibold">Generated Items Preview</h3>
                  <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                    {items.map((it,i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-lg">{i+1}. {it.word}</strong>
                          <div className="space-x-3 text-sm">
                            <label><input type="checkbox" checked={!!it.definition} onChange={e=>{const c=[...items]; c[i].definition=e.target.checked; setItems(c);}} /> Def</label>
                            <label><input type="checkbox" checked={!!it.blank} onChange={e=>{const c=[...items]; c[i].blank=e.target.checked; setItems(c);}} /> Blank</label>
                            <label><input type="checkbox" checked={!!it.sentence} onChange={e=>{const c=[...items]; c[i].sentence=e.target.checked; setItems(c);}} /> Sentence</label>
                          </div>
                        </div>
                        {it.definition && (
                          <div className="flex items-center gap-2">
                            <textarea rows={1} className="border w-full p-1 rounded" value={it.def || ''} onChange={e=>{const c=[...items]; c[i].def=e.target.value; setItems(c);}} placeholder="Definition" />
                            <button onClick={()=>regenerateDefinition(i)} className="px-2 py-1 text-sm bg-gray-200 rounded">Regen</button>
                          </div>
                        )}
                        {it.blank && (
                          <div className="flex items-center gap-2">
                            <textarea rows={1} className="border w-full p-1 rounded" value={it.clue || ''} onChange={e=>{const c=[...items]; c[i].clue=e.target.value; setItems(c);}} placeholder="Fill-in-the-blank sentence" />
                            <button onClick={()=>regenerateSentence(i)} className="px-2 py-1 text-sm bg-gray-200 rounded">Regen</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>createQuiz('draft')} className="mt-2 px-6 py-2 bg-gray-600 text-white rounded">Save as Draft</button>
                  <button onClick={()=>startPublishNewQuiz()} className="mt-2 px-6 py-2 bg-green-600 text-white rounded">Publish Quiz</button>
                </div>
              )}
            </div>
          </section>
          <section className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Drafts</h2>
              <div className="bg-white p-6 rounded shadow">
                {loading ? <div>Loading…</div> : <QuizTable quizzes={drafts} isDrafts={true} onEdit={handleEdit} onDelete={handleDelete} onPublish={handlePublish} teacherClasses={teacherClasses} onChangeClass={updateQuizClass} />}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold mb-4">Published Quizzes</h2>
              <div className="bg-white p-6 rounded shadow">
                {loading ? <div>Loading…</div> : <QuizTable quizzes={publishedQuizzes} isDrafts={false} onEdit={handleEdit} onDelete={handleDelete} onUnpublish={handleUnpublish} teacherClasses={teacherClasses} onChangeClass={updateQuizClass} />}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default QuizzesPage;
