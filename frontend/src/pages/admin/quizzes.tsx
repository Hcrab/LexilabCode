import React, { useState, useEffect, ChangeEvent, FC } from 'react';
import withAdminAuth from '../../components/withAdminAuth';
import { authFetch } from '../../lib/authFetch';
import { DateTime } from 'luxon';
import { formatToBeijingTime } from '../../lib/dateUtils';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const API = process.env.NEXT_PUBLIC_API_BASE || '/api';

// --- Interfaces ---
interface Item {
  word: string;
  blank: boolean;
  sentence: boolean;
  definition: boolean;
  clue: string;
  def: string;
}

interface Quiz {
  _id: string;
  name: string;
  type: string;
  data: { items: any[] };
  created_at: string;
  status: 'draft' | 'published';
  publish_at: string | null;
}

interface WordPool {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface WordInPool {
  id: string;
  word: string;
  status: 'new' | 'used';
}

// --- Word Pool Modal Component ---
interface WordPoolModalProps {
  onClose: () => void;
  wordPools: WordPool[];
  selectedPoolId: string | null;
  setSelectedPoolId: (id: string | null) => void;
  loading: boolean;
  loadingWords: boolean;
  wordsInSelectedPool: WordInPool[];
  showUsedWords: boolean;
  setShowUsedWords: (show: boolean) => void;
  newPoolName: string;
  setNewPoolName: (name: string) => void;
  newPoolDescription: string;
  setNewPoolDescription: (desc: string) => void;
  createPool: () => Promise<void>;
  deletePool: (poolId: string) => Promise<void>;
  updateWordStatus: (wordId: string, status: 'new' | 'used') => Promise<void>;
  delWord: (wordId: string, wordStr: string) => Promise<void>;
  newWord: string;
  setNewWord: (word: string) => void;
  addWord: () => Promise<void>;
  importFile: File | null;
  setImportFile: (file: File | null) => void;
  importTxt: () => Promise<void>;
}

const WordPoolModal: FC<WordPoolModalProps> = ({
  onClose, wordPools, selectedPoolId, setSelectedPoolId, loading, loadingWords,
  wordsInSelectedPool, showUsedWords, setShowUsedWords, newPoolName, setNewPoolName,
  newPoolDescription, setNewPoolDescription, createPool, deletePool, updateWordStatus,
  delWord, newWord, setNewWord, addWord, importFile, setImportFile, importTxt
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center">
    <div className="bg-white rounded-lg shadow-2xl p-8 space-y-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Manage Word Pools</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto pr-2">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-lg">All Word Pools</h3>
            <div className="mt-2 border rounded-lg max-h-60 overflow-y-auto">
              {wordPools.map(pool => (
                <div key={pool.id} className="flex justify-between items-center p-3 border-b last:border-b-0">
                  <div>
                    <p className="font-medium">{pool.name}</p>
                    <p className="text-sm text-gray-500">{pool.description}</p>
                  </div>
                  <button onClick={() => deletePool(pool.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t pt-6">
            <h4 className="font-semibold text-lg">Create New Pool</h4>
            <div className="flex flex-col gap-3 mt-2">
              <input className="border p-2 rounded" value={newPoolName} onChange={e => setNewPoolName(e.target.value)} placeholder="New pool name..." />
              <input className="border p-2 rounded" value={newPoolDescription} onChange={e => setNewPoolDescription(e.target.value)} placeholder="Description (optional)..." />
              <button onClick={createPool} className="bg-green-700 text-white px-4 py-2 rounded self-start" disabled={!newPoolName.trim()}>Create Pool</button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg">Manage Words In:</h3>
            <select className="border p-2 rounded w-full mt-2" value={selectedPoolId || ''} onChange={e => setSelectedPoolId(e.target.value)} disabled={loading}>
              {loading ? <option>Loading...</option> : wordPools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
            </select>
          </div>
          {selectedPoolId && (
            <>
              <div>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={showUsedWords} onChange={e => setShowUsedWords(e.target.checked)} />
                  <span>Show Used Words</span>
                </label>
              </div>
              <div className="mt-2 max-h-60 overflow-y-auto border rounded p-2 space-y-1 bg-gray-50">
                {loadingWords ? <p>Loading...</p> : wordsInSelectedPool.map(w => (
                  <div key={w.id} className="flex justify-between items-center p-1 hover:bg-gray-100">
                    <span>{w.word} (<span className={w.status === 'new' ? 'text-green-600' : 'text-gray-500'}>{w.status}</span>)</span>
                    <div className="space-x-2">
                      {w.status === 'new' ? (
                        <button onClick={() => updateWordStatus(w.id, 'used')} className="text-yellow-600 hover:text-yellow-800 text-sm">Mark Used</button>
                      ) : (
                        <button onClick={() => updateWordStatus(w.id, 'new')} className="text-blue-600 hover:text-blue-800 text-sm">Mark New</button>
                      )}
                      <button onClick={()=>delWord(w.id, w.word)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="font-semibold">Add Word</h4>
                <div className="flex gap-2 mt-2">
                  <input className="border p-2 rounded flex-grow" value={newWord} onChange={e=>setNewWord(e.target.value)} placeholder="New word..." disabled={!selectedPoolId} />
                  <button onClick={addWord} className="bg-indigo-600 text-white px-4 py-1 rounded" disabled={!newWord.trim() || !selectedPoolId}>Add</button>
                </div>
              </div>
               <div className="border-t pt-4">
                  <h4 className="font-semibold">Import from .txt</h4>
                  <div className="flex gap-2 mt-2 items-center">
                      <input type="file" accept=".txt" onChange={e => setImportFile(e.target.files ? e.target.files[0] : null)} className="text-sm" />
                      <button onClick={importTxt} className="bg-gray-600 text-white px-4 py-1 rounded" disabled={!importFile || !selectedPoolId}>Import</button>
                  </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  </div>
);

// --- Hint Modal Component ---
interface Hint {
  hint: string;
  pos: string;
  meaning: string;
}

type HintMode = 'hint' | 'direct';

interface HintModalProps {
  words: string[];
  hints: Record<string, Hint>;
  setHints: (hints: Record<string, Hint>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const HintModal: FC<HintModalProps> = ({ words, hints, setHints, onConfirm, onCancel }) => {
  const [mode, setMode] = useState<HintMode>('hint');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 space-y-6 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Add Additional Info (Optional)</h2>
            <p className="text-sm text-gray-600 mt-1">
              {mode === 'hint'
                ? 'For words with multiple meanings, provide a hint to guide the AI.'
                : 'Directly enter the POS and Meaning to bypass AI generation.'}
            </p>
          </div>
          <div className="flex-shrink-0">
            <div className="flex rounded-md shadow-sm">
              <button
                onClick={() => setMode('hint')}
                className={`px-4 py-2 text-sm font-medium rounded-l-md ${mode === 'hint' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Hint Mode
              </button>
              <button
                onClick={() => setMode('direct')}
                className={`px-4 py-2 text-sm font-medium rounded-r-md ${mode === 'direct' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Direct Mode
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto space-y-4 pr-2 flex-grow">
          {words.map(word => (
            <div key={word} className="p-3 border rounded-md bg-gray-50 space-y-3">
              <label className="font-bold text-lg text-gray-800">{word}</label>
              {mode === 'hint' ? (
                <input
                  className="border p-2 rounded w-full"
                  value={hints[word]?.hint || ''}
                  onChange={e => setHints({ ...hints, [word]: { ...hints[word], hint: e.target.value, pos: '', meaning: '' } })}
                  placeholder="Hint for AI (e.g., music, lock)"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    className="border p-2 rounded w-full"
                    value={hints[word]?.pos || ''}
                    onChange={e => setHints({ ...hints, [word]: { ...hints[word], pos: e.target.value, hint: '' } })}
                    placeholder="Directly enter POS (e.g., N.)"
                  />
                  <input
                    className="border p-2 rounded w-full"
                    value={hints[word]?.meaning || ''}
                    onChange={e => setHints({ ...hints, [word]: { ...hints[word], meaning: e.target.value, hint: '' } })}
                    placeholder="Directly enter Meaning"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end space-x-4 pt-4 border-t">
          <button onClick={onCancel} className="bg-gray-600 text-white px-6 py-2 rounded font-semibold">Cancel</button>
          <button onClick={onConfirm} className="bg-green-600 text-white px-6 py-2 rounded font-semibold">Confirm & Generate</button>
        </div>
      </div>
    </div>
  );
};


interface EditQuizProps {
  quiz: Quiz;
  items: Item[];
  setItems: (items: Item[]) => void;
  onFinish: (name: string, items: Item[], status: 'draft' | 'published', publishAt: string | null) => void;
  onCancel: () => void;
  onRegenerate: (itemIndex: number) => void;
  onRegenerateDef: (itemIndex: number) => void;
}

const EditQuiz: FC<EditQuizProps> = ({ quiz, items, setItems, onFinish, onCancel, onRegenerate, onRegenerateDef }) => {
  const [quizName, setQuizName] = useState(quiz.name);
  const [status, setStatus] = useState(quiz.status);
  const [publishAt, setPublishAt] = useState(quiz.publish_at || '');

  return (
    <div className="bg-white p-6 rounded shadow space-y-4">
      <h2 className="text-xl font-semibold">Editing Quiz: {quiz.name}</h2>
      <input 
        className="border p-2 rounded w-full" 
        value={quizName} 
        onChange={e => setQuizName(e.target.value)} 
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select className="border p-2 rounded w-full" value={status} onChange={e => setStatus(e.target.value as 'draft' | 'published')}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Publish At (optional)</label>
          <DatePicker
            selected={publishAt ? new Date(publishAt) : null}
            onChange={(date: Date | null) => setPublishAt(date ? date.toISOString() : '')}
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat="MMMM d, yyyy h:mm aa"
            className="border p-2 rounded w-full"
            placeholderText="Schedule a publish time"
          />
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
        {items.map((it, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
            <div className="flex justify-between items-center">
              <strong className="text-lg">{i + 1}. {it.word}</strong>
              <div className="space-x-3 text-sm">
                <label><input type="checkbox" checked={it.definition} onChange={e => { const c = [...items]; c[i].definition = e.target.checked; setItems(c); }} /> Def</label>
                <label><input type="checkbox" checked={it.blank} onChange={e => { const c = [...items]; c[i].blank = e.target.checked; setItems(c); }} /> Blank</label>
                <label><input type="checkbox" checked={it.sentence} onChange={e => { const c = [...items]; c[i].sentence = e.target.checked; setItems(c); }} /> Sentence</label>
              </div>
            </div>
            {it.definition && (
              <div className="flex items-center space-x-2">
                <textarea
                  rows={1}
                  className="border w-full p-1 rounded"
                  value={it.def}
                  onChange={e => { const c = [...items]; c[i].def = e.target.value; setItems(c); }}
                  placeholder="Definition"
                />
                <button
                  onClick={() => onRegenerateDef(i)}
                  className="text-sm bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                  title="Regenerate definition"
                >
                  Regen
                </button>
              </div>
            )}
            {it.blank && (
              <div className="flex items-center space-x-2">
                <textarea 
                  rows={1} 
                  className="border w-full p-1 rounded" 
                  value={it.clue} 
                  onChange={e => { const c = [...items]; c[i].clue = e.target.value; setItems(c); }} 
                  placeholder="Fill-in-the-blank sentence"
                />
                <button 
                  onClick={() => onRegenerate(i)} 
                  className="text-sm bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                  title="Regenerate sentence"
                >
                  Regen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex space-x-4">
        <button onClick={() => onFinish(quizName, items, 'draft', publishAt)} className="mt-4 bg-gray-600 text-white px-6 py-2 rounded font-semibold">Save as Draft</button>
        <button onClick={() => onFinish(quizName, items, 'published', publishAt)} className="mt-4 bg-green-600 text-white px-6 py-2 rounded font-semibold">Update Published Quiz</button>
        <button onClick={onCancel} className="mt-4 bg-red-600 text-white px-6 py-2 rounded font-semibold">Cancel</button>
      </div>
    </div>
  );
};


// --- Quiz Table Component ---
interface QuizTableProps {
  quizzes: Quiz[];
  isDrafts: boolean;
  onEdit: (quiz: Quiz) => void;
  onDelete: (id: string) => void;
  onUnpublish?: (id: string) => void;
  onPublish?: (id: string) => void;
}

const QuizTable: FC<QuizTableProps> = ({ quizzes, isDrafts, onEdit, onDelete, onUnpublish, onPublish }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-left border-collapse">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-3 border-b">Name</th>
          <th className="p-3 border-b">Type</th>
          <th className="p-3 border-b">Status</th>
          <th className="p-3 border-b">Publish At</th>
          <th className="p-3 border-b">Items</th>
          <th className="p-3 border-b">Created</th>
          <th className="p-3 border-b">Actions</th>
        </tr>
      </thead>
      <tbody>
        {quizzes.map(q => (
          <tr key={q._id} className="border-b hover:bg-gray-50">
            <td className="p-3">{q.name}</td>
            <td className="p-3">{q.type}</td>
            <td className="p-3">
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                q.status === 'published'
                  ? 'bg-green-100 text-green-800'
                  : q.status === 'to be published'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-yellow-100 text-yellow-800'
              }`}>
                {q.status}
              </span>
            </td>
            <td className="p-3">{q.publish_at ? formatToBeijingTime(q.publish_at) : 'N/A'}</td>
            <td className="p-3">{q.data.items.length}</td>
            <td className="p-3">{new Date(q.created_at).toLocaleDateString()}</td>
            <td className="p-3 space-x-2 whitespace-nowrap">
              <button onClick={() => onEdit(q)} className="px-3 py-1 bg-yellow-500 text-white rounded text-sm">Edit</button>
              {isDrafts && onPublish && (
                <button onClick={() => onPublish(q._id)} className="px-3 py-1 bg-green-500 text-white rounded text-sm">Publish</button>
              )}
              {!isDrafts && onUnpublish && (
                <button onClick={() => onUnpublish(q._id)} className="px-3 py-1 bg-gray-500 text-white rounded text-sm">Unpublish</button>
              )}
              <button onClick={() => onDelete(q._id)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
              <a href={`/quiz/${q._id}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-600 text-white rounded text-sm inline-block">Take</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);


function QuizzesPage() {
  // --- Global Data ---
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [wordPools, setWordPools] = useState<WordPool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [wordsInSelectedPool, setWordsInSelectedPool] = useState<WordInPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWords, setLoadingWords] = useState(false);

  // --- Form State ---
  const [mode, setMode] = useState<'weekday'|'custom'|'saturday'>('weekday');
  const [quizName, setQuizName] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [weekdayCount, setWeekdayCount] = useState(10);
  const [saturdayBlankCount, setSaturdayBlankCount] = useState(5);
  const [saturdaySentenceCount, setSaturdaySentenceCount] = useState(5);
  const [customWords, setCustomWords] = useState('');

  // --- Generation State ---
  const [items, setItems] = useState<Item[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isHintModalOpen, setHintModalOpen] = useState(false);
  const [wordHints, setWordHints] = useState<Record<string, Hint>>({});
  const [wordsForHinting, setWordsForHinting] = useState<string[]>([]);

  // --- Word Pool Management ---
  const [newWord, setNewWord] = useState('');
  const [importFile, setImportFile] = useState<File|null>(null);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolDescription, setNewPoolDescription] = useState('');
  const [showUsedWords, setShowUsedWords] = useState(false);
  const [isManagePoolsModalOpen, setManagePoolsModalOpen] = useState(false);

  // --- Editing State ---
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [editedItems, setEditedItems] = useState<Item[]>([]);

  // --- Data Fetching and Derived State ---
  const drafts = quizzes.filter(q => q.status === 'draft' || q.status === 'to be published');
  const publishedQuizzes = quizzes.filter(q => q.status === 'published');

  const fetchQuizzes = async () => {
    const qRes = await authFetch(`${API}/quizzes`);
    if (qRes.ok) {
        const data = await qRes.json();
        if (data && Array.isArray(data.quizzes)) {
            setQuizzes(data.quizzes);
        } else if (Array.isArray(data)) {
            setQuizzes(data);
        } else {
            setQuizzes([]);
        }
    }
  };

  // --- Initial Load & Pool Selection Effect ---
  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      try {
        const [qRes, poolsRes] = await Promise.all([
          authFetch(`${API}/quizzes`),
          authFetch(`${API}/admin/wordpools`)
        ]);

        if (qRes.ok) {
          const data = await qRes.json();
          // Defensive check to ensure data.quizzes is an array
          if (data && Array.isArray(data.quizzes)) {
            setQuizzes(data.quizzes);
          } else if (Array.isArray(data)) { // Handle case where API returns an array directly
            setQuizzes(data);
          } else {
            setQuizzes([]); // Default to empty array on unexpected structure
          }
        }
        
        if (poolsRes.ok) {
          const pools: WordPool[] = await poolsRes.json();
          setWordPools(pools);
          if (pools.length > 0 && !selectedPoolId) {
            setSelectedPoolId(pools[0].id);
          }
        }
      } catch (error) {
        console.error("Error during initial data load:", error);
      } finally {
        setLoading(false);
      }
    };
    initialLoad();
  }, []);

  const fetchWordsForSelectedPool = async (poolId: string) => {
    if (poolId) {
      setLoadingWords(true);
      try {
        const url = showUsedWords
          ? `${API}/admin/words?pool_id=${poolId}`
          : `${API}/admin/words?pool_id=${poolId}&status=new`;
          
        const wRes = await authFetch(url);
        if (wRes.ok) {
          setWordsInSelectedPool(await wRes.json());
        } else {
          setWordsInSelectedPool([]);
          console.error("Failed to fetch words for selected pool:", await wRes.text());
        }
      } catch (error) {
        console.error("Error fetching words for pool:", error);
        setWordsInSelectedPool([]);
      } finally {
        setLoadingWords(false);
      }
    } else {
      setWordsInSelectedPool([]);
    }
  };

  useEffect(() => {
    if (selectedPoolId) {
      fetchWordsForSelectedPool(selectedPoolId);
    } else {
      setWordsInSelectedPool([]);
    }
  }, [selectedPoolId, showUsedWords]);

  // --- Helpers ---
  const sampleWords = <T,>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    const result: T[] = [];
    const len = Math.min(n, copy.length);
    for (let i = 0; i < len; i++) {
      const j = Math.floor(Math.random() * copy.length);
      result.push(copy[j]);
      copy.splice(j, 1);
    }
    return result;
  };

  // --- Quiz Generation ---
  const handleGenerateSaturdayItems = async () => {
    if (saturdayBlankCount < 0 || saturdaySentenceCount < 0) return alert('Please enter a valid number.');
    if (saturdayBlankCount === 0 && saturdaySentenceCount === 0) return alert('Please request at least one question.');
    
    setGenerating(true);
    setItems([]);
    try {
      const res = await authFetch(`${API}/quizzes/saturday-special`, {
        method: 'POST',
        body: JSON.stringify({ 
          blank_count: saturdayBlankCount,
          sentence_count: saturdaySentenceCount
        })
      });
      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to generate items.');
      }
      const fetchedItems = await res.json();
      if (fetchedItems.length === 0) {
        alert("Could not find enough questions from the past 5 days' quizzes.");
        return;
      }

      const wordToItemMap = new Map<string, Item>();

      fetchedItems.forEach((item: any) => {
        if (!wordToItemMap.has(item.word)) {
          wordToItemMap.set(item.word, {
            word: item.word,
            blank: false,
            sentence: false,
            definition: false,
            clue: '',
            def: item.definition || ''
          });
        }
        const existingItem = wordToItemMap.get(item.word)!;
        if (item.type === 'fill-in-the-blank') {
          existingItem.blank = true;
          existingItem.clue = item.sentence;
        }
        if (item.type === 'sentence') {
          existingItem.sentence = true;
        }
      });

      setItems(Array.from(wordToItemMap.values()));

    } catch (error) {
      console.error("Error generating Saturday items:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateItems = () => {
    let list: string[] = [];
    if (mode === 'weekday') {
      if (!selectedPoolId) return alert('Please select a word pool.');
      const newWords = wordsInSelectedPool.filter(w => w.status === 'new').map(w => w.word);
      if (newWords.length < weekdayCount) {
        return alert(`Not enough NEW words in pool (have ${newWords.length}, need ${weekdayCount})`);
      }
      list = sampleWords(newWords, weekdayCount);
    } else if (mode === 'custom') {
      list = customWords.split(/[\n,]+/).map(w => w.trim()).filter(Boolean);
      if (list.length === 0) return alert('Please enter at least one word');
    }
    if (list.length > 0) {
      setWordsForHinting(list);
      setWordHints({});
      setHintModalOpen(true);
    }
  };

  const regenerateSentence = async (itemIndex: number) => {
    const newItems = [...items];
    const item = newItems[itemIndex];
    
    if (!item) return;

    item.clue = '(regenerating...)';
    setItems([...newItems]);

    try {
      const res = await authFetch(`${API}/ai/fill-blanks`, {
        method: 'POST',
        body: JSON.stringify({ word: item.word, definition: item.def || '' })
      });

      if (!res.ok) throw new Error(`Failed to regenerate sentence: ${await res.text()}`);
      
      const data = await res.json();
      item.clue = data.sentence || '(error)';

    } catch (e) {
      console.error(e);
      item.clue = `(error: ${e.message})`;
    } finally {
      setItems([...newItems]);
    }
  };

  const regenerateDefinition = async (itemIndex: number) => {
    const newItems = [...items];
    const item = newItems[itemIndex];
    if (!item) return;
    item.def = '(regenerating...)';
    setItems([...newItems]);
    try {
      const payload: any = { word: item.word };
      const res = await authFetch(`${API}/ai/definition`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Failed to regenerate definition: ${await res.text()}`);
      const data = await res.json();
      item.def = data.definition || '(error)';
    } catch (e: any) {
      console.error(e);
      item.def = `(error: ${e.message})`;
    } finally {
      setItems([...newItems]);
    }
  };

  const regenerateEditedSentence = async (itemIndex: number) => {
    const newItems = [...editedItems];
    const item = newItems[itemIndex];
    
    if (!item) return;

    item.clue = '(regenerating...)';
    setEditedItems([...newItems]);

    try {
      const res = await authFetch(`${API}/ai/fill-blanks`, {
        method: 'POST',
        body: JSON.stringify({ word: item.word, definition: item.def || '' })
      });

      if (!res.ok) throw new Error(`Failed to regenerate sentence: ${await res.text()}`);
      
      const data = await res.json();
      item.clue = data.sentence || '(error)';

    } catch (e) {
      console.error(e);
      item.clue = `(error: ${e.message})`;
    } finally {
      setEditedItems([...newItems]);
    }
  };

  const regenerateEditedDefinition = async (itemIndex: number) => {
    const newItems = [...editedItems];
    const item = newItems[itemIndex];
    if (!item) return;
    item.def = '(regenerating...)';
    setEditedItems([...newItems]);
    try {
      const payload: any = { word: item.word };
      const res = await authFetch(`${API}/ai/definition`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Failed to regenerate definition: ${await res.text()}`);
      const data = await res.json();
      item.def = data.definition || '(error)';
    } catch (e: any) {
      console.error(e);
      item.def = `(error: ${e.message})`;
    } finally {
      setEditedItems([...newItems]);
    }
  };

  const startGenerationProcess = async (hints: Record<string, Hint>) => {
    setHintModalOpen(false);
    const list = wordsForHinting;

    const its: Item[] = list.map(w => ({
      word: w, blank: true, sentence: false, definition: mode === 'weekday',
      clue: '(pending...)', def: '(generating...)'
    }));

    if (mode === 'weekday') {
      const indices = Array.from(Array(its.length).keys());
      const sentenceIndices = its.length <= 5 ? indices : sampleWords(indices, 5);
      sentenceIndices.forEach(i => { its[i].sentence = true; });
    }

    setItems(its);
    setProgress(0);
    setGenerating(true);

    const newItems = [...its];

    const processInBatches = async (
      itemsToProcess: Item[], 
      asyncFn: (item: Item, index: number) => Promise<void>, 
      batchSize: number
    ) => {
      for (let i = 0; i < itemsToProcess.length; i += batchSize) {
        const batch = itemsToProcess.slice(i, i + batchSize);
        await Promise.all(batch.map((item, j) => asyncFn(item, i + j)));
      }
    };

    const generateDefinition = async (item: Item, index: number) => {
      if (mode === 'weekday') {
        try {
          const hintData = hints[item.word];

          // If in direct input mode (pos and meaning are provided), construct definition directly
          if (hintData?.pos && hintData?.meaning) {
            newItems[index].def = `${hintData.pos} ${hintData.meaning}`;
          } else { // Otherwise, call the AI
            const payload: { word: string; hint?: string; } = { word: item.word };
            if (hintData?.hint) {
              payload.hint = hintData.hint;
            }
            const res = await authFetch(`${API}/ai/definition`, { method: 'POST', body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(`Definition failed: ${await res.text()}`);
            newItems[index].def = (await res.json()).definition || '';
          }
        } catch (e) {
          console.error(e);
          newItems[index].def = `(error: ${e.message})`;
        }
      } else {
        newItems[index].def = '';
      }
      setItems([...newItems]);
      setProgress(p => p + 1);
    };

    await processInBatches(newItems, generateDefinition, 10);
    
    setProgress(0);

    const generateSentence = async (item: Item, index: number) => {
      try {
        const res = await authFetch(`${API}/ai/fill-blanks`, { method: 'POST', body: JSON.stringify({ word: item.word, definition: item.def }) });
        if (!res.ok) throw new Error(`Fill-blanks failed: ${await res.text()}`);
        newItems[index].clue = (await res.json()).sentence || '(error)';
      } catch (e) {
        console.error(e);
        newItems[index].clue = `(error: ${e.message})`;
      }
      setItems([...newItems]);
      setProgress(p => p + 1);
    };

    await processInBatches(newItems, generateSentence, 10);

    setGenerating(false);
  };

  // --- Quiz Creation ---
  const createQuiz = async (status: 'draft' | 'published') => {
    if (!quizName.trim()) return alert('Quiz name is required');
    if (items.length === 0) return alert('Generate items first');

    const payloadItems: any[] = [];
    items.forEach(it => {
      if (it.blank) payloadItems.push({ type: 'fill-in-the-blank', word: it.word, definition: it.definition ? it.def : '', sentence: it.clue });
      if (it.sentence) payloadItems.push({ type: 'sentence', word: it.word, definition: it.definition ? it.def : '' });
    });

    if (payloadItems.length === 0) return alert('You must include at least one question per word');

    const payload = {
      name: quizName,
      type: mode,
      data: { items: payloadItems },
      pool_id: selectedPoolId,
      status: status,
      publish_at: publishAt ? new Date(publishAt).toISOString() : null,
    };

    const res = await authFetch(`${API}/quizzes`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert(`Quiz ${status === 'draft' ? 'saved as draft' : 'published'}`);
      setQuizName('');
      setItems([]);
      setCustomWords('');
      setProgress(0);
      setPublishAt('');
      fetchQuizzes();
      if (mode === 'weekday' && selectedPoolId) fetchWordsForSelectedPool(selectedPoolId);
    } else {
      alert((await res.json()).error || 'Create failed');
    }
  };

  // --- Quiz Editing ---
  const handleFinishEditing = async (newName: string, editedItems: Item[], status: 'draft' | 'published', publishAt: string | null) => {
    if (!editingQuiz) return;

    const payloadItems: any[] = [];
    editedItems.forEach(it => {
      if (it.blank) payloadItems.push({ type: 'fill-in-the-blank', word: it.word, definition: it.definition ? it.def : '', sentence: it.clue });
      if (it.sentence) payloadItems.push({ type: 'sentence', word: it.word, definition: it.definition ? it.def : '' });
    });

    if (payloadItems.length === 0) return alert('You must include at least one question per word');

    const payload = {
      name: newName,
      data: { items: payloadItems },
      status: status,
      publish_at: publishAt ? new Date(publishAt).toISOString() : null,
    };

    const res = await authFetch(`${API}/quizzes/${editingQuiz._id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert('Quiz updated');
      setEditingQuiz(null);
      setEditedItems([]);
      fetchQuizzes();
    } else {
      alert((await res.json()).error || 'Update failed');
    }
  };

  const handleEdit = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    const wordToItem = new Map<string, Item>();
    quiz.data.items.forEach(quizItem => {
      if (!wordToItem.has(quizItem.word)) {
        wordToItem.set(quizItem.word, {
          word: quizItem.word,
          blank: false,
          sentence: false,
          definition: false,
          clue: '',
          def: ''
        });
      }
      const item = wordToItem.get(quizItem.word)!;
      if (quizItem.type === 'fill-in-the-blank') {
        item.blank = true;
        item.clue = quizItem.sentence;
      }
      if (quizItem.type === 'sentence') {
        item.sentence = true;
      }
      if (quizItem.definition) {
        item.definition = true;
        item.def = quizItem.definition;
      }
    });
    setEditedItems(Array.from(wordToItem.values()));
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this quiz?')) {
      const res = await authFetch(`${API}/quizzes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchQuizzes();
      } else {
        alert((await res.json()).error || 'Delete failed');
      }
    }
  };

  const handlePublish = async (id: string) => {
    const res = await authFetch(`${API}/quizzes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'published', publish_at: null })
    });
    if (res.ok) {
      fetchQuizzes();
    } else {
      alert((await res.json()).error || 'Publish failed');
    }
  };

  const handleUnpublish = async (id: string) => {
    const res = await authFetch(`${API}/quizzes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'draft' })
    });
    if (res.ok) {
      fetchQuizzes();
    } else {
      alert((await res.json()).error || 'Unpublish failed');
    }
  };

  // --- Word Pool Management Handlers ---
  const createPool = async () => {
    if (!newPoolName.trim()) return;
    const res = await authFetch(`${API}/admin/wordpools`, {
      method: 'POST',
      body: JSON.stringify({ name: newPoolName, description: newPoolDescription })
    });
    if (res.ok) {
      const newPool = await res.json();
      setWordPools(prev => [...prev, newPool].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedPoolId(newPool.id);
      setNewPoolName('');
      setNewPoolDescription('');
    } else {
      alert((await res.json()).error || 'Failed to create pool');
    }
  };

  const deletePool = async (poolIdToDelete: string) => {
    const poolToDelete = wordPools.find(p => p.id === poolIdToDelete);
    if (!poolToDelete) return;

    if (confirm(`Are you sure you want to delete the pool "${poolToDelete.name}"? This will also delete all words in it.`)) {
      const res = await authFetch(`${API}/admin/wordpools/${poolIdToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        const remainingPools = wordPools.filter(p => p.id !== poolIdToDelete);
        setWordPools(remainingPools);
        if (selectedPoolId === poolIdToDelete) {
          setSelectedPoolId(remainingPools.length > 0 ? remainingPools[0].id : null);
        }
      } else {
        alert((await res.json()).error || 'Failed to delete pool');
      }
    }
  };

  const updateWordStatus = async (wordId: string, newStatus: 'new' | 'used') => {
    const res = await authFetch(`${API}/admin/words/${wordId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      fetchWordsForSelectedPool(selectedPoolId!);
    } else {
      alert((await res.json()).error || 'Failed to update word status');
    }
  };

  const addWord = async () => {
    if (!newWord.trim() || !selectedPoolId) return;
    const r = await authFetch(`${API}/admin/words`, {
      method:'POST',
      body:JSON.stringify({ word: newWord.trim(), pool_id: selectedPoolId })
    });
    if (r.ok) {
      setNewWord('');
      fetchWordsForSelectedPool(selectedPoolId);
    } else {
      alert((await r.json()).error);
    }
  };

  const delWord = async (wordId: string, wordStr: string) => {
    if (!selectedPoolId || !confirm(`Delete "${wordStr}"?`)) return;
    const r = await authFetch(`${API}/admin/words/${wordId}?pool_id=${selectedPoolId}`, { method: 'DELETE' });
    if (r.ok) {
      fetchWordsForSelectedPool(selectedPoolId);
    } else {
      alert((await r.json()).error);
    }
  };

  const importTxt = async () => {
    if (!importFile || !selectedPoolId) return;
    const fd = new FormData();
    fd.append('file', importFile);
    fd.append('pool_id', selectedPoolId);
    const r = await authFetch(`${API}/admin/words/import`, { method: 'POST', body: fd });
    const j = await r.json();
    alert(j.message || j.error);
    if (r.ok) {
      setImportFile(null);
      fetchWordsForSelectedPool(selectedPoolId);
    }
  };

  return (
    <main className="p-6 bg-gray-50 space-y-8 min-h-screen">
      {isManagePoolsModalOpen && <WordPoolModal 
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
      />}
      {isHintModalOpen && <HintModal
        words={wordsForHinting}
        hints={wordHints}
        setHints={setWordHints}
        onConfirm={() => startGenerationProcess(wordHints)}
        onCancel={() => setHintModalOpen(false)}
      />}
      <h1 className="text-3xl font-bold">Quiz Management</h1>

      {editingQuiz ? (
        <EditQuiz
          quiz={editingQuiz}
          items={editedItems}
          setItems={setEditedItems}
          onFinish={handleFinishEditing}
          onCancel={() => {
            setEditingQuiz(null);
            setEditedItems([]);
          }}
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
                  <select className="border p-2 rounded w-full" value={mode} onChange={e=>{ setMode(e.target.value as any); setItems([]); }}>
                    <option value="weekday">Weekday</option>
                    <option value="saturday">Saturday</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">Publish At (optional)</label>
                  <DatePicker
                    selected={publishAt ? new Date(publishAt) : null}
                    onChange={(date: Date | null) => setPublishAt(date ? date.toISOString() : '')}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="MMMM d, yyyy h:mm aa"
                    className="border p-2 rounded w-full"
                    placeholderText="Schedule a publish time"
                  />
                </div>
              </div>
              
              {mode==='weekday' && (
                <div className="border-t pt-4 mt-4 space-y-3">
                   <div className="flex items-center gap-4">
                     <div className="flex-grow">
                        <label className="block text-sm font-medium">Word Pool</label>
                        <select className="border p-2 rounded w-full mt-1" value={selectedPoolId || ''} onChange={e => setSelectedPoolId(e.target.value)} disabled={loading}>
                          {loading ? <option>Loading...</option> : wordPools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
                        </select>
                     </div>
                     <button onClick={() => setManagePoolsModalOpen(true)} className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded self-end">
                        Manage
                     </button>
                   </div>
                   <div className="flex items-end gap-4">
                      <div>
                        <label className="block text-sm font-medium">Number of Words</label>
                        <input type="number" className="border p-2 w-24 rounded mt-1" value={weekdayCount} onChange={e=>setWeekdayCount(Number(e.target.value))} min={1} />
                      </div>
                      <button onClick={handleGenerateItems} disabled={generating || !selectedPoolId || loadingWords} className="bg-blue-600 text-white px-5 py-2 rounded disabled:bg-gray-400">
                        {generating ? `Generating... ${progress}/${items.length}` : 'Generate Items'}
                      </button>
                   </div>
                </div>
              )}

              {mode==='saturday' && (
                <div className="border-t pt-4 mt-4 space-y-3">
                   <div className="flex items-end gap-4">
                      <div>
                        <label className="block text-sm font-medium">Number of Fill-in-the-blank</label>
                        <input type="number" className="border p-2 w-48 rounded mt-1" value={saturdayBlankCount} onChange={e=>setSaturdayBlankCount(Number(e.target.value))} min={0} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium">Number of Sentences</label>
                        <input type="number" className="border p-2 w-48 rounded mt-1" value={saturdaySentenceCount} onChange={e=>setSaturdaySentenceCount(Number(e.target.value))} min={0} />
                      </div>
                      <button onClick={handleGenerateSaturdayItems} disabled={generating} className="bg-purple-600 text-white px-5 py-2 rounded disabled:bg-gray-400">
                        {generating ? 'Generating...' : 'Generate From Past 5 Days'}
                      </button>
                   </div>
                </div>
              )}

              {mode==='custom' && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium">Custom Words</label>
                    <textarea rows={4} className="border w-full p-2 rounded mt-1" placeholder="One word per line or comma‑separated" value={customWords} onChange={e=>setCustomWords(e.target.value)} />
                  </div>
                  <button onClick={handleGenerateItems} disabled={generating} className="bg-blue-600 text-white px-5 py-2 rounded disabled:bg-gray-400">
                    {generating ? `Generating... ${progress}/${items.length}` : 'Generate Items'}
                  </button>
                </div>
              )}
              
              {items.length > 0 && (
                <div className="space-y-4 mt-6 pt-4 border-t">
                  <h3 className="text-lg font-semibold">Generated Items Preview</h3>
                  <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                    {items.map((it, i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
                        <div className="flex justify-between items-center">
                          <strong className="text-lg">{i+1}. {it.word}</strong>
                          <div className="space-x-3 text-sm">
                            <label><input type="checkbox" checked={it.definition} onChange={e=>{const c=[...items];c[i].definition=e.target.checked;setItems(c);}}/> Def</label>
                            <label><input type="checkbox" checked={it.blank} onChange={e=>{const c=[...items];c[i].blank=e.target.checked;setItems(c);}}/> Blank</label>
                            <label><input type="checkbox" checked={it.sentence} onChange={e=>{const c=[...items];c[i].sentence=e.target.checked;setItems(c);}}/> Sentence</label>
                          </div>
                        </div>
                        {it.definition && (
                          <div className="flex items-center space-x-2">
                            <textarea
                              rows={1}
                              className="border w-full p-1 rounded"
                              value={it.def}
                              onChange={e=>{const c=[...items];c[i].def=e.target.value;setItems(c);}}
                              placeholder="Definition"
                            />
                            <button
                              onClick={() => regenerateDefinition(i)}
                              className="text-sm bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                              title="Regenerate definition"
                            >
                              Regen
                            </button>
                          </div>
                        )}
                        {it.blank && (
                          <div className="flex items-center space-x-2">
                            <textarea 
                              rows={1} 
                              className="border w-full p-1 rounded" 
                              value={it.clue} 
                              onChange={e => { const c = [...items]; c[i].clue = e.target.value; setItems(c); }} 
                              placeholder="Fill-in-the-blank sentence"
                            />
                            <button 
                              onClick={() => regenerateSentence(i)} 
                              className="text-sm bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                              title="Regenerate sentence"
                            >
                              Regen
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => createQuiz('draft')} className="mt-4 bg-gray-600 text-white px-6 py-2 rounded font-semibold">Save as Draft</button>
                  <button onClick={() => createQuiz('published')} className="mt-4 bg-green-600 text-white px-6 py-2 rounded font-semibold">Publish Quiz</button>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Drafts</h2>
              <div className="bg-white p-6 rounded shadow">
                {loading ? <p>Loading…</p> : <QuizTable quizzes={drafts} isDrafts={true} onEdit={handleEdit} onDelete={handleDelete} onPublish={handlePublish} />}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold mb-4">Published Quizzes</h2>
              <div className="bg-white p-6 rounded shadow">
                {loading ? <p>Loading…</p> : <QuizTable quizzes={publishedQuizzes} isDrafts={false} onEdit={handleEdit} onDelete={handleDelete} onUnpublish={handleUnpublish} />}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}


export default withAdminAuth(QuizzesPage);
