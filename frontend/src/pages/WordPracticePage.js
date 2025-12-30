import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BeakerIcon, BookOpenIcon, SparklesIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';


// --- Utility Functions ---
const shuffleArray = (array) => {
  return [...array].sort(() => Math.random() - 0.5);
};

const getCleanWord = (word) => {
  if (!word) return '';
  const match = word.match(/^([a-zA-Z\s-]+)/);
  return match ? match[1] : word;
};

const generateDistractors = (currentItem, allItems, count, type = 'word') => {
    const currentRoot = currentItem.word_root;
    
    // Level 1: Different root word
    let pool = allItems.filter(item => item.word_root !== currentRoot);
    
    // Level 2: If pool is too small, allow same root as fallback
    if (pool.length < count) {
      const sameRootPool = allItems.filter(item => item.word_root === currentRoot && item.word !== currentItem.word);
      pool = [...pool, ...sameRootPool];
    }
    
    // Level 3: If still too small, fill with anything except the exact same word
    if (pool.length < count) {
      const anyOtherPool = allItems.filter(item => item.word !== currentItem.word);
      pool = [...pool, ...anyOtherPool];
    }

    // Ensure uniqueness
    const uniquePool = Array.from(new Set(pool.map(p => p.word))).map(w => allItems.find(i => i.word === w));

    const distractors = shuffleArray(uniquePool).slice(0, count);
    
    if (type === 'definition') {
      return distractors.map(i => i.definition.cn);
    }
    return distractors.map(i => i.word);
};

const encouragingMessages = [
  "It's okay—every mistake is one step closer to success.",
  "That was tricky! You'll get it next time.",
  "Keep going—persistence pays off.",
  "Learning is a journey; this is just one step.",
  "Great effort! The correct answer is your next target."
];

const getRandomEncouragement = () => encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];

// --- Shared TTS Utilities ---
let __sharedAudio = null;
let __lastObjectUrl = null;
let __ttsEpoch = 0;
const __activeTtsControllers = new Set();

const ensureSharedAudio = () => {
  if (!__sharedAudio) {
    try { __sharedAudio = new Audio(); } catch (_) { __sharedAudio = null; }
  }
  return __sharedAudio;
};

const isPureEnglish = (text) => {
  if (!text) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return letters > 0 && letters >= han * 2; // heuristic: clearly more letters than Han
};

const zhDominates = (text) => {
  if (!text) return false;
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return han > letters; // more Chinese than English letters
};

export const skipAllTTS = () => {
  __ttsEpoch += 1;
  try {
    for (const c of __activeTtsControllers) {
      try { c.abort(); } catch (_) {}
    }
    __activeTtsControllers.clear();
    const audio = ensureSharedAudio();
    if (audio) {
      try { audio.pause(); } catch (_) {}
      audio.src = '';
    }
    if (__lastObjectUrl) {
      try { URL.revokeObjectURL(__lastObjectUrl); } catch (_) {}
      __lastObjectUrl = null;
    }
  } catch (_) {}
};

export const cancelAllTTS = skipAllTTS;

export const playTTS = async (text) => {
  if (!text) return;
  const epoch = __ttsEpoch;
  const token = localStorage.getItem('token');
  const controller = new AbortController();
  __activeTtsControllers.add(controller);
  try {
    // Stop any current playback
    const audio = ensureSharedAudio();
    if (audio) {
      try { audio.pause(); } catch (_) {}
      audio.src = '';
    }
    if (__lastObjectUrl) {
      try { URL.revokeObjectURL(__lastObjectUrl); } catch (_) {}
      __lastObjectUrl = null;
    }
    const res = await fetch(`/api/tts/say`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('TTS request failed');
    const blob = await res.blob();
    if (epoch !== __ttsEpoch) return; // stale
    const url = URL.createObjectURL(blob);
    __lastObjectUrl = url;
    if (!audio) return;
    audio.src = url;
    audio.onended = () => {
      audio.onended = null; audio.onerror = null;
      // cleanup later; object URL may be reused for replay until next call
    };
    audio.onerror = () => {
      audio.onended = null; audio.onerror = null;
    };
    await audio.play().catch(() => {});
  } catch (_) {
    // swallow
  } finally {
    __activeTtsControllers.delete(controller);
  }
};

export const playTTSOnceWait = async (text, maxWaitMs = 2200) => {
  if (!text) return;
  const startEpoch = __ttsEpoch;
  const token = localStorage.getItem('token');
  const controller = new AbortController();
  __activeTtsControllers.add(controller);
  try {
    const audio = ensureSharedAudio();
    if (audio) { try { audio.pause(); } catch (_) {} audio.src = ''; }
    if (__lastObjectUrl) { try { URL.revokeObjectURL(__lastObjectUrl); } catch (_) {} __lastObjectUrl = null; }
    const res = await fetch(`/api/tts/say`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('TTS request failed');
    const blob = await res.blob();
    if (startEpoch !== __ttsEpoch) return; // cancelled
    const url = URL.createObjectURL(blob);
    __lastObjectUrl = url;
    if (!audio) return;
    audio.src = url;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      const to = setTimeout(finish, Math.max(1500, Math.min(20000, maxWaitMs)));
      audio.onended = () => { clearTimeout(to); finish(); };
      audio.onerror = () => { clearTimeout(to); finish(); };
      audio.play().catch(() => { clearTimeout(to); finish(); });
    });
  } catch (_) {
    // ignore
  } finally {
    __activeTtsControllers.delete(controller);
  }
};

// --- Auto Audio Preference Helpers ---
const AUTO_AUDIO_KEY = 'wp_auto_audio';
const getAutoAudioPref = (fallback = true) => {
  try {
    const v = localStorage.getItem(AUTO_AUDIO_KEY);
    if (v === null || v === undefined) return fallback;
    return v === '1' || v === 'true';
  } catch (_) {
    return fallback;
  }
};
const setAutoAudioPref = (val) => {
  try { localStorage.setItem(AUTO_AUDIO_KEY, val ? '1' : '0'); } catch (_) {}
};

// --- API Fetcher ---
const fetchPracticeSessionData = async (word_list, tier, token) => {
    const res = await fetch('/api/student/practice-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ word_list, tier }),
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to fetch practice data');
    }
    return res.json();
};

// --- Child Components ---

// (no resume modal or cookie helpers)

const HighlightedSentence = ({ sentence, isPureMode, targetWord }) => {
    const parts = sentence.split(/(\[[^\]]+\])/g);

    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cleanTarget = (targetWord ? getCleanWord(targetWord) : '').trim();
    const targetRegex = cleanTarget
        ? new RegExp(`\\b${escapeRegExp(cleanTarget)}\\b`, 'gi')
        : null;

    const renderNonBracketPart = (text, keyBase) => {
        if (!targetRegex) return text;
        const out = [];
        let lastIndex = 0;
        let match;
        let idx = 0;
        while ((match = targetRegex.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (start > lastIndex) {
                out.push(text.slice(lastIndex, start));
            }
            out.push(
                <strong key={`${keyBase}-t-${idx++}`} className="font-bold text-blue-600 px-1 py-0.5 bg-blue-100 rounded-sm">
                    {match[0]}
                </strong>
            );
            lastIndex = end;
        }
        if (lastIndex < text.length) {
            out.push(text.slice(lastIndex));
        }
        return out.length > 0 ? out : text;
    };

    return (
        <p className="text-lg mb-4 leading-relaxed">
            {parts.map((part, i) => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    // Bracket priority: highlight bracketed content as a whole;
                    // do not additionally highlight the target inside.
                    const word = part.slice(1, -1);
                    const displayWord = isPureMode ? getCleanWord(word) : word;
                    return (
                        <strong key={`b-${i}`} className="font-bold text-blue-600 px-2 py-1 bg-blue-100 rounded-md">
                            {displayWord}
                        </strong>
                    );
                }
                // Non-bracket text: additionally highlight all occurrences of the target word
                return <React.Fragment key={`t-${i}`}>{renderNonBracketPart(part, `nb-${i}`)}</React.Fragment>;
            })}
        </p>
    );
};

const ScramblePuzzle = ({ scrambled, onSubmit, disabled = false }) => {
    const initialWords = useMemo(() => scrambled.map((word, index) => ({ word, id: index })), [scrambled]);
    const [selected, setSelected] = useState([]);
    const [options, setOptions] = useState(initialWords);

    useEffect(() => {
        const newInitialWords = scrambled.map((word, index) => ({ word, id: index }));
        setOptions(newInitialWords);
        setSelected([]);
    }, [scrambled]);

    const handleSelectWord = (word) => {
        if (disabled) return;
        setSelected([...selected, word]);
        setOptions(options.filter(o => o.id !== word.id));
    };

    const handleDeselectWord = (word) => {
        if (disabled) return;
        setSelected(selected.filter(s => s.id !== word.id));
        setOptions([...options, word].sort((a, b) => a.id - b.id));
    };

    const handleSubmitClick = () => {
        if (disabled) return;
        onSubmit(selected.map(s => s.word).join(' '));
    };

    const showLabel = (s) => (typeof s === 'string' ? s.replace(/_/g, ' ') : s);

    return (
        <div>
            <div className="p-4 border-b-2 border-gray-300 mb-4 min-h-[60px] flex flex-wrap gap-2 items-center bg-gray-50 rounded-t-md">
                {selected.length === 0 && <span className="text-gray-400">Build your sentence here...</span>}
                {selected.map((word) => (
                    <button key={word.id} onClick={() => handleDeselectWord(word)} disabled={disabled} className="px-3 py-2 bg-white border-2 border-gray-300 rounded-md text-lg font-medium shadow-sm animate-fade-in disabled:opacity-60 disabled:cursor-not-allowed">
                        {showLabel(word.word)}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap justify-center gap-3 my-4 min-h-[60px]">
                {options.map((word) => (
                    <button key={word.id} onClick={() => handleSelectWord(word)} disabled={disabled} className="px-3 py-2 bg-white border-2 border-blue-400 rounded-md text-lg font-medium hover:bg-blue-100 transition-all transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed">
                        {showLabel(word.word)}
                    </button>
                ))}
            </div>
            <button onClick={handleSubmitClick} disabled={disabled || selected.length === 0} className="w-full bg-blue-600 text-white px-4 py-3 rounded-md font-semibold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                Check
            </button>
        </div>
    );
};

const QuestionView = ({
  question,
  onSubmit,
  isPureMode,
  inputsDisabled = false,
  // optional Chinese hint and controls for stage 3 (sentence reordering)
  cnHintText,
  cnShown = false,
  onToggleCn,
  redoNoHintActive = false,
}) => {
  const getQuestionTitle = () => {
    const wordToShow = isPureMode ? getCleanWord(question.word) : question.word;
    switch (question.stage) {
      case 1: return 'Infer Meaning';
      case 2: return 'Definition Q&A';
      case 3: return `Sentence Reordering: ${wordToShow}`;
      case 4: return 'Which word is it?';
      default: return 'Practice';
    }
  };

  const renderQuestionContent = () => {
    const inferMeaningExercise = question.item.exercises.find(e => e.type === 'infer_meaning');
    const reorderingExercise = question.item.exercises.find(e => e.type === 'sentence_reordering');
    const synonymExercise = question.item.exercises.find(e => e.type === 'synonym_replacement');
    const wordToShow = isPureMode ? getCleanWord(question.word) : question.word;

    switch (question.stage) {
      case 1:
        return (
          <div>
            <p className="text-lg mb-4">In this sentence, what does the highlighted word mean?</p>
            <div className="p-4 border rounded-md bg-gray-100 mb-4">
                {inferMeaningExercise?.sentence && (
                  <HighlightedSentence 
                    sentence={inferMeaningExercise.sentence} 
                    isPureMode={isPureMode}
                    targetWord={question.word}
                  />
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {question.options?.map((option, index) => (
                <button key={index} onClick={() => onSubmit(option)} disabled={inputsDisabled} className="p-3 bg-white border-2 border-gray-300 rounded-md text-left hover:bg-blue-100 hover:border-blue-400 transition-all h-full disabled:opacity-60 disabled:cursor-not-allowed">
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div>
            <p className="text-lg mb-4">What is the meaning of <span className="font-bold">{wordToShow}</span>?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {question.options?.map((option, index) => (
                <button key={index} onClick={() => onSubmit(option)} disabled={inputsDisabled} className="p-3 bg-white border-2 border-gray-300 rounded-md text-left hover:bg-blue-100 hover:border-blue-400 transition-all h-full disabled:opacity-60 disabled:cursor-not-allowed">
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        const scrambled = Array.isArray(question.scrambled)
          ? question.scrambled
          : (typeof (reorderingExercise?.sentence_answer) === 'string'
              ? reorderingExercise.sentence_answer.split(' ')
              : []);
        // Stage 3: add optional CN hint + redo banner
        return (
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-lg">Reorder the following sentence:</p>
              {!redoNoHintActive && (
                <button
                  type="button"
                  onClick={() => (typeof onToggleCn === 'function' ? onToggleCn(!cnShown) : null)}
                  className={`text-sm px-3 py-1 rounded shadow ${cnShown ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                  title={cnShown ? 'Hide Chinese translation' : 'Show Chinese translation'}
                >
                  {cnShown ? 'Hide Chinese' : 'Show Chinese'}
                </button>
              )}
            </div>
            {redoNoHintActive && (
              <div className="mb-3 p-2 rounded bg-blue-50 text-blue-800 text-sm border border-blue-200">
                Great! Now try again without the Chinese hint.
              </div>
            )}
            {cnShown && !redoNoHintActive && (
              <div className="mb-3 p-3 rounded bg-yellow-50 border border-yellow-200 text-yellow-900">
                {cnHintText || 'No Chinese hint available'}
              </div>
            )}
            {scrambled && <ScramblePuzzle scrambled={scrambled} onSubmit={onSubmit} disabled={inputsDisabled} />}
          </div>
        );
      case 4:
        const sentence = synonymExercise?.sentence;
        const definition = `Which word means: "${question.item.definition?.cn}"?`;
        return (
          <div>
            {sentence ? <HighlightedSentence sentence={sentence} isPureMode={isPureMode} /> : <p className="text-lg mb-4">{definition}</p>}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {question.options?.map((option, index) => (
                <button key={index} onClick={() => onSubmit(option)} disabled={inputsDisabled} className="p-3 bg-white border-2 border-gray-300 rounded-md text-center hover:bg-blue-100 hover:border-blue-400 transition-all h-full font-semibold disabled:opacity-60 disabled:cursor-not-allowed">
                  {isPureMode ? getCleanWord(option) : option}
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return <p>Invalid practice stage.</p>;
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h4 className="font-bold text-2xl mb-4 text-center">{getQuestionTitle()}</h4>
      {renderQuestionContent()}
    </div>
  );
};

// Caches to keep UX stable across StrictMode remounts
const reorderingExplainCache = new Map(); // key -> explanation
const loggedReorderKeys = new Set(); // key set to avoid duplicate logs

const FeedbackModal = ({ result, onClose, isPureMode }) => {
  const { item } = result || {};

  // Hooks for reordering explanation (declare unconditionally to satisfy Hooks rules)
  const [explanation, setExplanation] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  // Conditionally fetch AI explanation only for sentence reordering wrong answers
  React.useEffect(() => {
    if (result && result.type === 'reordering' && !result.correct) {
      const userAnswer = result.userAnswer || '';
      const correctAnswer = result.correctAnswer || '';
      const word = (item && item.word) || '';
      const key = `${word}|${userAnswer}|${correctAnswer}`;
      let cancelled = false;
      const run = async () => {
        // If cached, show immediately and (optionally) log once
        if (reorderingExplainCache.has(key)) {
          if (!cancelled) {
            setExplanation(reorderingExplainCache.get(key));
            setLoading(false);
          }
        } else {
          setLoading(true);
          try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ai/explain-reordering', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ user_answer: userAnswer, correct_answer: correctAnswer }),
            });
            const data = await res.json();
            const expl = data.explanation || 'Explanation not available.';
            reorderingExplainCache.set(key, expl);
            if (!cancelled) setExplanation(expl);
          } catch (_) {
            const expl = 'Explanation service not available.';
            reorderingExplainCache.set(key, expl);
            if (!cancelled) setExplanation(expl);
          } finally {
            if (!cancelled) setLoading(false);
          }
        }
        // Log once per key (after we have explanation from cache or fetch)
        try {
          if (!loggedReorderKeys.has(key)) {
            loggedReorderKeys.add(key);
            const token = localStorage.getItem('token');
            const payload = {
              user_answer: userAnswer,
              correct_answer: correctAnswer,
              explanation: reorderingExplainCache.get(key) || 'Explanation not available.',
              word
            };
            fetch('/api/student/log-reordering-error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(payload)
            }).catch(()=>{});
          }
        } catch (_) {}
      };
      run();
      return () => { cancelled = true; };
    } else {
      setExplanation('');
      setLoading(false);
    }
  }, [result]);

  // Success toast for correct answers
  if (result?.correct) {
    return <div className="mt-4 p-3 rounded-md text-white font-bold bg-green-500 text-center">Correct!</div>;
  }

  // Special handling for sentence reordering (stage 3) wrong answers
  if (result?.type === 'reordering') {
    const userAnswer = result.userAnswer || '';
    const correctAnswer = result.correctAnswer || '';
    const fmt = (s) => (typeof s === 'string' ? s.replace(/_/g, ' ') : s);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
        <div className="bg-white rounded-lg shadow-2xl p-8 space-y-5 w-full max-w-2xl m-4 max-h-[90vh] flex flex-col">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sentence Reordering Explanation</h2>
            <div className="space-y-2 text-gray-800">
              <p><span className="font-semibold">Your Answer:</span> {fmt(userAnswer)}</p>
              <p><span className="font-semibold">Correct Answer:</span> <span className="text-blue-600">{fmt(correctAnswer)}</span></p>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto pr-2">
            <h3 className="font-bold text-lg mt-2">Explanation</h3>
            <div className="mt-2 p-4 bg-gray-50 border rounded min-h-[80px] whitespace-pre-wrap">
              {loading ? 'Generating explanation...' : explanation}
            </div>
          </div>
          <button onClick={onClose} className="w-full bg-blue-600 text-white px-6 py-3 rounded-md font-semibold text-lg hover:bg-blue-700">
            OK
          </button>
        </div>
      </div>
    );
  }

  // Default wrong answer modal (stages 1/2/4)
  const wordToShow = isPureMode ? getCleanWord(item.word) : item.word;
  const correctAnswerToShow = isPureMode ? getCleanWord(result.correctAnswer) : result.correctAnswer;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 space-y-5 w-full max-w-lg m-4 max-h-[90vh] flex flex-col">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-600">{getRandomEncouragement()}</p>
          <h2 className="text-4xl font-bold mt-3 text-gray-900">{wordToShow}</h2>
          <h3 className="text-xl font-semibold mt-2 text-gray-800">Correct answer: <span className="text-blue-600">{correctAnswerToShow}</span></h3>
          {result && result.userAnswer !== undefined && (
            <p className="text-base mt-2 text-gray-700">Your answer: <span className="font-medium text-gray-900">{result.userAnswer}</span></p>
          )}
        </div>
        {item && (
          <div className="flex-grow overflow-y-auto pr-2 space-y-4 mt-4 pt-4 border-t">
            <div className="p-4 border rounded-md bg-gray-50 text-left">
              <p className="font-bold text-gray-800">{item.definition.en}</p>
              <p className="text-gray-600 mt-1">{item.definition.cn}</p>
            </div>
            <h4 className="font-bold text-lg mt-4 pt-4 border-t">Example Sentences:</h4>
            <ul className="space-y-3">
              {item.sample_sentences?.map((s, index) => (
                 <li key={index}>
                   <p className="text-gray-800 font-medium">» {s.sentence}</p>
                   <p className="text-gray-500 pl-4">{s.translation}</p>
                 </li>
              ))}
            </ul>
          </div>
        )}
        <button onClick={onClose} className="w-full bg-blue-600 text-white px-6 py-3 rounded-md font-semibold text-lg hover:bg-blue-700 mt-4">
          OK
        </button>
      </div>
    </div>
  );
};

// Dictation input view extracted to top-level to avoid remount on each keystroke
const DictationInlineView = ({
  currentWord,
  item,
  meaning,
  pos,
  isFetchingAudio,
  playTts,
  dictInput,
  setDictInput,
  lastDiff,
  correctFlash,
  dictIdx,
  totalCount,
  handleDictationSubmit,
  advanceAfterWrong,
}) => {
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-3">
        <div className="text-gray-800"><span className="font-semibold">Chinese Meaning:</span> {meaning || '—'}</div>
        <button onClick={() => playTts(currentWord)} disabled={isFetchingAudio} className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">
          {isFetchingAudio ? 'Playing…' : 'Play Pronunciation'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          className="flex-1 border rounded px-3 py-2 text-lg"
          placeholder="Type the spelling and press Enter or Submit"
          value={dictInput}
          onChange={(e) => setDictInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !lastDiff) handleDictationSubmit(); }}
          disabled={!!lastDiff}
        />
        <button onClick={handleDictationSubmit} disabled={!!lastDiff} className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400">Submit</button>
      </div>

      {correctFlash && <div className="mt-3 p-2 bg-green-500 text-white text-center font-bold rounded">Correct!</div>}

      {lastDiff && (
        <div className="mt-4 p-3 border rounded bg-gray-50">
          {lastDiff.el}
          <div className="mt-3 text-sm text-gray-700 space-y-2">
            {pos && <div><span className="font-semibold">POS:</span> {pos}</div>}
            {item?.definition?.en && <div><span className="font-semibold">English:</span> {item.definition.en}</div>}
            {meaning && <div><span className="font-semibold">Chinese:</span> {meaning}</div>}
            {Array.isArray(item?.sample_sentences) && item.sample_sentences.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold">Examples:</div>
                <ul className="list-disc ml-5">
                  {item.sample_sentences.slice(0,2).map((s, i) => (
                    <li key={i}><span className="text-gray-800">{s.sentence}</span>{s.translation ? <span className="text-gray-600"> — {s.translation}</span> : null}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-4 text-right">
            <button onClick={advanceAfterWrong} className="px-4 py-2 bg-blue-600 text-white rounded">OK</button>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-600 text-right">{Math.min(dictIdx + 1, totalCount)} / {totalCount}</div>
    </div>
  );
};

const QuizSession = ({ items, initialProgress, onSessionEnd, onWordRelearned, isPureMode, setIsPureMode, practiceMode, tier, resumeRoundWords, resumeQuestionIndex, pretestSkipped = [], extraDictationWords = [], fullItems = [], onDictationComplete }) => {
  const [wordProgress, setWordProgress] = useState(initialProgress);
  const [currentRound, setCurrentRound] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [showDictationPrompt, setShowDictationPrompt] = useState(false);

  // Dictation state
  const [dictationMode, setDictationMode] = useState(false);
  const [dictationWords, setDictationWords] = useState([]);
  const [dictIdx, setDictIdx] = useState(0);
  const [dictInput, setDictInput] = useState('');
  const [dictWrongSet, setDictWrongSet] = useState(new Set());
  const [isFetchingAudio, setIsFetchingAudio] = useState(false);
  const [lastDiff, setLastDiff] = useState(null);
  const [correctFlash, setCorrectFlash] = useState(false);
  const [dictationAllWords, setDictationAllWords] = useState([]);
  // legacy caches no longer used; kept minimal
  const ttsBlobUrlCache = useRef(new Map());
  const playedOnceRef = useRef(new Set());

  // Auto audio for practice session
  const [autoAudioEnabled, setAutoAudioEnabled] = useState(() => getAutoAudioPref(true));
  const [ttsLoading, setTtsLoading] = useState(false);
  const [autoPanel, setAutoPanel] = useState({ show: false, okEnabled: false, word: '', item: null, progressSnapshot: null });
  const proceededRef = useRef(false);

  // Reordering (stage 3) CN hint + redo state
  const [reorderCnShown, setReorderCnShown] = useState(false);
  const [reorderRedoActive, setReorderRedoActive] = useState(false);

  const itemsByWord = useMemo(() => items.reduce((acc, item) => {
    acc[item.word] = item;
    return acc;
  }, {}), [items]);

  const fullItemsByWord = useMemo(() => (fullItems || []).reduce((acc, item) => {
    if (item && item.word) acc[item.word] = item;
    return acc;
  }, {}), [fullItems]);

  const mergedItemsByWord = useMemo(() => ({ ...fullItemsByWord, ...itemsByWord }), [fullItemsByWord, itemsByWord]);

  const getCn = (item) => {
    if (!item) return '';
    return (item.definition && (item.definition.cn || item.definition?.zh || item.definition?.ch)) || item.definition_cn || '';
  };

  // Try to extract a Chinese translation for the current sentence-reordering exercise.
  const getReorderCnHint = (q) => {
    try {
      const item = q?.item || {};
      const r = Array.isArray(item?.exercises) ? item.exercises.find(e => e && e.type === 'sentence_reordering') : null;
      if (!r) return '';
      // 1) Direct tiered or plain CN field, preferring explicit tiered translation
      if (r.sentence_answer_cn && typeof r.sentence_answer_cn === 'object') {
        const tieredCn = selectTierString(r.sentence_answer_cn, tier);
        if (tieredCn) return tieredCn;
      }
      const any = r.sentence_answer_cn || r.cn || r.translation || r.sentence_cn;
      if (typeof any === 'string' && any) return any;
      // Fallback for non-string 'any' (should be covered by selectTierString above if object)
      if (any && typeof any === 'object') {
          const vals = Object.values(any).filter(v => typeof v === 'string');
          if (vals.length > 0) return vals[0];
      }
      // 2) Try find from sample_sentences by matching the English
      const ansEn = selectTierString(r.sentence_answer, tier).replace(/_/g, ' ').trim();
      if (ansEn && Array.isArray(item.sample_sentences)) {
        const normalize = (s) => (s || '').toLowerCase().replace(/[\s]+/g, ' ').replace(/[.,/#!$%^&*;:{}=`~()\[\]"'\-]/g, '').trim();
        const ansKey = normalize(ansEn);
        for (const s of item.sample_sentences) {
          const sen = normalize(s?.sentence || '');
          if (sen && (sen === ansKey || sen.includes(ansKey) || ansKey.includes(sen))) {
            if (typeof s?.translation === 'string' && s.translation.trim()) return s.translation.trim();
          }
        }
        // If no exact match, fall back to the first available sample translation
        for (const s of item.sample_sentences) {
          if (typeof s?.translation === 'string' && s.translation.trim()) {
            return s.translation.trim();
          }
        }
      }
      // 3) Do not fallback to word-level definition here;
      // for sentence reordering, show no hint if no proper translation found.
      return '';
    } catch {
      return '';
    }
  };

  const selectTierString = (maybeTiered, fallbackTier = 'tier_3') => {
    if (!maybeTiered) return '';
    if (typeof maybeTiered === 'string') return maybeTiered;
    try {
      const t = (typeof fallbackTier === 'string' && fallbackTier) ? fallbackTier : 'tier_3';
      const normalized = String(t).startsWith('tier_') ? t : `tier_${t}`;
      const keys = [normalized, t, 'tier_3', 'tier3'];
      for (const k of keys) {
        if (typeof maybeTiered[k] === 'string' && maybeTiered[k].trim()) return maybeTiered[k];
      }
      const vals = Object.values(maybeTiered).filter(v => typeof v === 'string' && v.trim());
      return vals.length > 0 ? vals[0] : '';
    } catch { return ''; }
  };

  const buildQuestionForWord = (word, currentProgress) => {
    const item = itemsByWord[word];
    const progress = currentProgress[word];
    const question = { word, stage: progress.stage, item };
    if (progress.stage === 1 || progress.stage === 2) {
      const correctAnswer = item.definition.cn;
      const distractors = generateDistractors(item, items, 3, 'definition');
      question.options = shuffleArray([correctAnswer, ...distractors]);
    } else if (progress.stage === 4) {
      const correctAnswer = item.word;
      const distractors = generateDistractors(item, items, 6, 'word');
      question.options = shuffleArray([correctAnswer, ...distractors]);
    } else if (progress.stage === 3) {
      const r = item.exercises.find(e => e.type === 'sentence_reordering');
      const ans = selectTierString(r?.sentence_answer, tier).trim();
      let tokens = ans.split(/\s+/).filter(Boolean);
      // Runtime merge to ensure <= 10 blocks even if DB not merged
      const mergeTokens = (toks, target, max=10) => {
        const core = (s)=> (s||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g,'').toLowerCase();
        const targetCore = (target||'').toLowerCase();
        let blocks = toks.map(t=>[t]);
        const protectedFlags = toks.map(t => core(t) === targetCore);
        const PUNCT = new Set([",", ".", ";", ":", "!", "?", "，", "。", "；", "：", "！", "？", "…", "—", "(", ")", "[", "]", "{", "}", '"', "'", "`"]);
        const hasTrailing = b => b && b.length>0 && PUNCT.has(b[b.length-1].slice(-1));
        const hasLeading = b => b && b.length>0 && PUNCT.has(b[0][0]);
        const scorePair = (b1,b2)=>{
          const len = arr => arr.reduce((s,t)=>s+core(t).length,0);
          let s = len(b1)+len(b2);
          if (hasTrailing(b1) || hasLeading(b2)) s += 1000;
          return s;
        };
        while (blocks.length > max) {
          // compute block-level protected
          let idx=0; const blkProt=[];
          for (const b of blocks) {
            let prot=false;
            for (let k=0;k<b.length;k++) if (protectedFlags[idx+k]) { prot=true; break; }
            blkProt.push(prot);
            idx += b.length;
          }
          let bestIdx=-1, bestScore=Infinity;
          for (let i=0;i<blocks.length-1;i++) {
            if (blkProt[i] || blkProt[i+1]) continue;
            const s = scorePair(blocks[i], blocks[i+1]);
            if (s < bestScore) { bestScore = s; bestIdx = i; }
          }
          if (bestIdx < 0) break;
          const merged = blocks[bestIdx].concat(blocks[bestIdx+1]);
          blocks.splice(bestIdx, 2, merged);
        }
        return blocks.map(b=>b.join('_'));
      };
      if (tokens.length > 10) tokens = mergeTokens(tokens, item.word, 10);
      question.scrambled = shuffleArray(tokens);
    }
    return question;
  };

  const buildNextRound = (currentProgress) => {
    const learningWords = Object.keys(currentProgress).filter(word => currentProgress[word].status === 'learning');
    if (learningWords.length === 0) {
        // End of normal practice: offer dictation
        setShowDictationPrompt(true);
        return;
    }
    const incorrectWords = learningWords.filter(word => currentProgress[word].last_result === 'incorrect');
    const correctWords = learningWords.filter(word => currentProgress[word].last_result === 'correct');
    let roundWords = [...incorrectWords];
    for (const word of correctWords) {
      if (roundWords.length < 8) roundWords.push(word);
    }
    if (roundWords.length === 0 && learningWords.length > 0) {
        roundWords = learningWords.slice(0, 8);
    }

    const nextRound = roundWords.map(word => buildQuestionForWord(word, currentProgress));

    setCurrentRound(shuffleArray(nextRound));
    setQuestionIndex(0);
  };

  useEffect(() => {
    // If resume data includes explicit round order, rebuild without shuffling
    if (resumeRoundWords && resumeRoundWords.length > 0) {
      const restored = resumeRoundWords
        .filter(w => !!itemsByWord[w])
        .map(word => buildQuestionForWord(word, initialProgress));
      if (restored.length > 0) {
        setCurrentRound(restored);
        setQuestionIndex(Math.min(resumeQuestionIndex || 0, Math.max(restored.length - 1, 0)));
        return;
      }
    }
    buildNextRound(initialProgress);
  }, [initialProgress, resumeRoundWords, resumeQuestionIndex, itemsByWord]);

  // Persist lightweight resume snapshot on progress changes (simplest approach)
  useEffect(() => {
    try {
      const snapshot = {
        sessionStatus: 'learning',
        practiceMode,
        tier,
        learningItems: items,
        wordProgress,
        currentRoundWords: currentRound.map(q => q.word),
        questionIndex,
      };
      localStorage.setItem('wp_resume_v1', JSON.stringify(snapshot));
    } catch {}
  }, [wordProgress, items, practiceMode, tier, currentRound, questionIndex]);

  const proceedToNextStep = (progressOverride) => {
    setLastAnswerResult(null);
    // reset reordering hint/redo flags for next question
    setReorderCnShown(false);
    setReorderRedoActive(false);
    if (questionIndex < currentRound.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      buildNextRound(progressOverride || wordProgress);
    }
  };

  const handleAnswerSubmit = (answer) => {
    const currentQuestion = currentRound[questionIndex];
    if (!currentQuestion) return;
    // When the auto-audio meaning panel is visible, ignore further submissions
    if (autoAudioEnabled && autoPanel.show) return;

    let isCorrect = false;
    let correctAnswerText = '';
    let answerForDisplay = answer;
    const reorderingExercise = currentQuestion.item.exercises.find(e => e.type === 'sentence_reordering');

    switch (currentQuestion.stage) {
      case 1:
      case 2:
        isCorrect = answer === currentQuestion.item.definition.cn;
        correctAnswerText = currentQuestion.item.definition.cn;
        break;
      case 3:
        const normalizeReordering = (s) => {
          if (!s) return '';
          return s
            .replace(/_/g, ' ')                // treat merged blocks as spaces
            .replace(/[.,/#!$%^&*;:{}=`~()]/g, '') // strip punctuation (keep hyphen/apostrophe semantics if needed)
            .toLowerCase()
            .replace(/\s+/g, ' ')             // collapse spaces
            .trim();
        };
        const cleanUserAnswer = normalizeReordering(answer);
        const correctRaw = selectTierString(reorderingExercise.sentence_answer, tier);
        const cleanCorrectAnswer = normalizeReordering(correctRaw);
        isCorrect = cleanUserAnswer === cleanCorrectAnswer;
        correctAnswerText = correctRaw;
        answerForDisplay = answer;
        // If user used CN hint and got correct, require a redo without hint
        if (isCorrect && reorderCnShown && !reorderRedoActive) {
          try {
            // Reshuffle existing blocks for a second attempt; keep within current question
            setCurrentRound(prev => {
              try {
                const copy = [...prev];
                const q = { ...(copy[questionIndex] || {}) };
                const blocks = Array.isArray(q.scrambled) ? [...q.scrambled] : (reorderingExercise.sentence_answer || '').split(/\s+/);
                q.scrambled = shuffleArray(blocks);
                copy[questionIndex] = q;
                return copy;
              } catch {
                return prev;
              }
            });
          } catch {}
          setReorderRedoActive(true);
          setReorderCnShown(false);
          // Do not advance progress / do not show feedback modal / do not trigger auto audio
          return;
        }
        break;
      case 4:
        isCorrect = getCleanWord(answer).toLowerCase() === getCleanWord(currentQuestion.word).toLowerCase();
        correctAnswerText = currentQuestion.word;
        break;
      default:
        break;
    }

    const updatedProgress = { ...wordProgress };
    const currentWordProgress = updatedProgress[currentQuestion.word];

    if (isCorrect) {
      const nextStage = currentWordProgress.stage + 1;
      const isNowMastered = nextStage >= 5;
      updatedProgress[currentQuestion.word] = {
        ...currentWordProgress,
        stage: nextStage,
        last_result: 'correct',
        status: isNowMastered ? 'mastered' : 'learning',
      };
      if (isNowMastered) {
        onWordRelearned(currentQuestion.word);
      }
    } else {
      updatedProgress[currentQuestion.word] = { ...currentWordProgress, stage: 1, last_result: 'incorrect' };
    }
    setWordProgress(updatedProgress);
    
    const baseResult = {
      correct: isCorrect,
      correctAnswer: correctAnswerText,
      item: itemsByWord[currentQuestion.word],
      userAnswer: answerForDisplay
    };
    if (currentQuestion.stage === 3 && !isCorrect) {
      setLastAnswerResult({ ...baseResult, type: 'reordering', userAnswer: answerForDisplay });
    } else {
      setLastAnswerResult(baseResult);
    }

    if (isCorrect) {
      if (!autoAudioEnabled) {
        setTimeout(() => { proceedToNextStep(updatedProgress); }, 600);
      } else {
        // Prepare inline auto-audio panel and start playback
        setLastAnswerResult(null);
        const item = itemsByWord[currentQuestion.word];
        setAutoPanel({ show: true, okEnabled: false, word: currentQuestion.word, item, progressSnapshot: updatedProgress });
        (async () => {
          try {
            setTtsLoading(true);
            const wordText = getCleanWord(currentQuestion.word);
            await playTTSOnceWait(wordText, 2200);
            // Follow-up sentence depending on stage
            let follow = '';
            const infer = currentQuestion.item.exercises.find(e => e.type === 'infer_meaning');
            const reorder = currentQuestion.item.exercises.find(e => e.type === 'sentence_reordering');
            const syno = currentQuestion.item.exercises.find(e => e.type === 'synonym_replacement');
            if (currentQuestion.stage === 1 && infer?.sentence && isPureEnglish(infer.sentence) && !zhDominates(infer.sentence)) {
              follow = infer.sentence;
            } else if (currentQuestion.stage === 3 && reorderingExercise?.sentence_answer) {
              const cr = selectTierString(reorderingExercise.sentence_answer, tier);
              follow = String(cr || '').replace(/_/g, ' ');
            } else if (currentQuestion.stage === 4 && syno?.sentence && isPureEnglish(syno.sentence) && !zhDominates(syno.sentence)) {
              follow = syno.sentence;
            }
            if (follow) {
              await playTTSOnceWait(follow, 3200);
            }
          } catch (_) {
          } finally {
            setTtsLoading(false);
            setAutoPanel(prev => ({ ...prev, okEnabled: true }));
          }
        })();
      }
    }
  };

  const currentQuestion = currentRound[questionIndex];
  const masteredCount = Object.values(wordProgress).filter(p => p.status === 'mastered').length;
  // Progress across four stages per word: x/y where y = items.length * 4
  const totalSteps = useMemo(() => (Array.isArray(items) ? items.length * 4 : 0), [items]);
  const currentSteps = useMemo(() => {
    try {
      return Object.values(wordProgress || {}).reduce((sum, p) => {
        const stage = Math.max(1, Math.min(5, p?.stage ?? 1));
        const completed = Math.max(0, Math.min(4, stage - 1));
        return sum + completed;
      }, 0);
    } catch {
      return 0;
    }
  }, [wordProgress]);
  const progressPct = totalSteps > 0 ? Math.min(100, Math.max(0, (currentSteps / totalSteps) * 100)) : 0;

  // --- Dictation helpers ---
  const currentDictWord = dictationWords[dictIdx] || '';
  const expectedClean = (currentDictWord ? getCleanWord(currentDictWord) : '').toLowerCase();

  const startDictation = () => {
    // Learn mode: practiced words ∪ pretestSkipped
    // Review mode: all review words via extraDictationWords
    const practiced = Object.keys(wordProgress || {});
    const base = practiceMode === 'review' ? extraDictationWords : practiced;
    const all = Array.from(new Set([...(base || []), ...(pretestSkipped || [])])).filter(Boolean);
    setDictationWords(all);
    setDictationAllWords(all);
    setDictIdx(0);
    setDictInput('');
    setDictWrongSet(new Set());
    setLastDiff(null);
    setShowDictationPrompt(false);
    setDictationMode(true);
  };

  const endDictation = () => {
    // Mark all dictation words as mastered and notify parent
    try {
      const words = [...(dictationAllWords || dictationWords)];
      if (typeof onDictationComplete === 'function') onDictationComplete(words);
    } catch (_) {}
    onSessionEnd();
  };

  const lcsDiff = (a, b) => {
    // Simple LCS to align expected (b) vs user (a)
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const res = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { res.push({ type: 'eq', ch: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { res.push({ type: 'ins', ch: a[i] }); i++; }
      else { res.push({ type: 'del', ch: b[j] }); j++; }
    }
    while (i < n) { res.push({ type: 'ins', ch: a[i++] }); }
    while (j < m) { res.push({ type: 'del', ch: b[j++] }); }
    return res;
  };

  const renderDictationDiff = (user, expected) => {
    const diff = lcsDiff(user, expected);
    // Build two lines per spec
    const userLine = [];
    const expLine = [];
    diff.forEach((d, idx) => {
      if (d.type === 'eq') {
        userLine.push(<span key={`u${idx}`} className="px-0.5">{d.ch}</span>);
        expLine.push(<span key={`e${idx}`} className="px-0.5">{d.ch}</span>);
      } else if (d.type === 'ins') {
        userLine.push(<span key={`u${idx}`} className="px-0.5 bg-red-200 text-red-900 rounded-sm">{d.ch}</span>);
        expLine.push(<span key={`e${idx}`} className="inline-block w-2"/>);
      } else if (d.type === 'del') {
        userLine.push(<span key={`u${idx}`} className="px-0.5 text-gray-400">·</span>);
        expLine.push(<span key={`e${idx}`} className="px-0.5 underline decoration-blue-500 decoration-2 underline-offset-4">{d.ch}</span>);
      }
    });
    return (
      <div className="mt-3 space-y-1">
        <div className="text-sm text-gray-700">Your Answer:</div>
        <div className="font-mono text-lg break-all">{userLine}</div>
        <div className="text-sm text-gray-700 mt-2">Correct Spelling:</div>
        <div className="font-mono text-lg break-all">{expLine}</div>
      </div>
    );
  };

  const playTts = async (word) => {
    try {
      setIsFetchingAudio(true);
      await playTTS(getCleanWord(word));
    } catch (_) {
    } finally {
      setIsFetchingAudio(false);
    }
  };

  // Auto play for dictation: when entering a new word, speak it (respects auto audio toggle)
  useEffect(() => {
    if (!dictationMode || !autoAudioEnabled) return;
    const w = currentDictWord;
    if (!w) return;
    (async () => {
      try { await playTTSOnceWait(getCleanWord(w), 2000); } catch (_) {}
    })();
    return () => { /* nothing */ };
  }, [dictationMode, currentDictWord, autoAudioEnabled]);

  useEffect(() => {
    return () => {
      // Revoke any created blob URLs on unmount to avoid leaks
      try {
        for (const url of ttsBlobUrlCache.current.values()) {
          URL.revokeObjectURL(url);
        }
        ttsBlobUrlCache.current.clear();
      } catch {}
    };
  }, []);

  const handleDictationSubmit = () => {
    const user = (dictInput || '').trim().toLowerCase();
    const expected = expectedClean;
    if (user === expected) {
      setCorrectFlash(true);
      setLastDiff(null);
      setTimeout(() => {
        setCorrectFlash(false);
        const nextIdx = dictIdx + 1;
        if (nextIdx >= dictationWords.length) {
          // end of pass
          const wrong = Array.from(dictWrongSet);
          if (wrong.length > 0) {
            setDictationWords(wrong);
            setDictWrongSet(new Set());
            setDictIdx(0);
            setDictInput('');
          } else {
            endDictation();
          }
        } else {
          setDictIdx(nextIdx);
          setDictInput('');
        }
      }, 800);
    } else {
      // wrong: compute diff and require acknowledge
      const diffEl = renderDictationDiff(user, expected);
      setLastDiff({ el: diffEl, word: currentDictWord });
      const newSet = new Set(dictWrongSet);
      newSet.add(currentDictWord);
      setDictWrongSet(newSet);
    }
  };

  const advanceAfterWrong = () => {
    setLastDiff(null);
    const nextIdx = dictIdx + 1;
    if (nextIdx >= dictationWords.length) {
      const wrong = Array.from(dictWrongSet);
      if (wrong.length > 0) {
        setDictationWords(wrong);
        setDictWrongSet(new Set());
        setDictIdx(0);
        setDictInput('');
      } else {
        endDictation();
      }
    } else {
      setDictIdx(nextIdx);
      setDictInput('');
    }
  };

  // Prepare props for the dictation view
  const dictItem = mergedItemsByWord[currentDictWord] || itemsByWord[currentDictWord] || {};
  const dictMeaning = (dictItem && dictItem.definition && dictItem.definition.cn) ? dictItem.definition.cn : '';
  const dictPos = dictItem?.pos || dictItem?.part_of_speech || '';

  return (
    <div className="mt-6 p-4 border-2 border-dashed border-purple-400 rounded-lg bg-purple-50">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-6">
            <h3 className="text-xl font-bold text-purple-800">Practice Session</h3>
            <button
              onClick={() => setAutoAudioEnabled(prev => {
                const next = !prev;
                if (!next) {
                  // Turning OFF hides the panel and re-enables inputs immediately
                  setAutoPanel({ show: false, okEnabled: false, word: '', item: null, progressSnapshot: null });
                  skipAllTTS();
                }
                setAutoAudioPref(next);
                return next;
              })}
              className={`text-sm px-2 py-1 rounded border ${autoAudioEnabled ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200' : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'}`}
            >
              Auto audio: {autoAudioEnabled ? 'ON' : 'OFF'}
            </button>
        </div>
        {!dictationMode && (
          <div className="text-lg font-semibold bg-green-200 text-green-800 px-3 py-1 rounded-full">
            Completed: {masteredCount} / {items.length}
          </div>
        )}
      </div>
      {/* Hide overall progress during dictation */}
      {!dictationMode && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-600">{currentSteps}/{totalSteps}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className="bg-green-500 h-3 transition-all" style={{ width: `${progressPct}%` }}></div>
          </div>
        </div>
      )}
      
      {!dictationMode && lastAnswerResult && <FeedbackModal result={lastAnswerResult} onClose={() => proceedToNextStep()} isPureMode={isPureMode} />}
      
      {!dictationMode && !lastAnswerResult && currentQuestion && (
        <div>
          <QuestionView
            question={currentQuestion}
            onSubmit={handleAnswerSubmit}
            isPureMode={isPureMode}
            inputsDisabled={autoAudioEnabled && autoPanel.show}
            cnHintText={getReorderCnHint(currentQuestion)}
            cnShown={reorderCnShown}
            onToggleCn={setReorderCnShown}
            redoNoHintActive={reorderRedoActive}
          />
          {autoAudioEnabled && autoPanel.show && (
            <div className="mt-4 p-4 border rounded bg-white">
              <div className="text-sm text-gray-700 mb-2">Meaning:</div>
              <div className="text-gray-900 font-medium">{autoPanel.item?.definition?.cn || ''}</div>
              {autoPanel.item?.definition?.en && (
                <div className="text-gray-600 mt-1">{autoPanel.item.definition.en}</div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={!autoPanel.okEnabled}
                  onClick={() => { const snap = autoPanel.progressSnapshot || wordProgress; setAutoPanel({ show: false, okEnabled: false, word: '', item: null, progressSnapshot: null }); proceedToNextStep(snap); }}
                  className={`px-4 py-2 rounded font-semibold ${autoPanel.okEnabled ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                >
                  OK
                </button>
                <button
                  onClick={() => { skipAllTTS(); setTtsLoading(false); setAutoPanel(prev => ({ ...prev, okEnabled: true })); }}
                  className="px-4 py-2 rounded bg-gray-200 text-gray-900 hover:bg-gray-300"
                >
                  Skip Audio
                </button>
                <button
                  onClick={async () => {
                    try {
                      // Replay current sequence; do not disable OK
                      const w = getCleanWord(autoPanel.word || '');
                      if (!w) return;
                      await playTTSOnceWait(w, 2200);
                      // Try follow-up sentence while still on the same question
                      const q = currentQuestion;
                      if (q) {
                        let follow = '';
                        const infer = q.item.exercises.find(e => e.type === 'infer_meaning');
                        const reorder = q.item.exercises.find(e => e.type === 'sentence_reordering');
                        const syno = q.item.exercises.find(e => e.type === 'synonym_replacement');
                        if (q.stage === 1 && infer?.sentence && isPureEnglish(infer.sentence) && !zhDominates(infer.sentence)) {
                          follow = infer.sentence;
                        } else if (q.stage === 3 && reorder?.sentence_answer) {
                          const cr = selectTierString(reorder.sentence_answer, tier);
                          follow = String(cr || '').replace(/_/g, ' ');
                        } else if (q.stage === 4 && syno?.sentence && isPureEnglish(syno.sentence) && !zhDominates(syno.sentence)) {
                          follow = syno.sentence;
                        }
                        if (follow) await playTTSOnceWait(follow, 3200);
                      }
                    } catch (_) {}
                  }}
                  className="px-4 py-2 rounded bg-white border hover:bg-gray-50"
                >
                  Listen Again
                </button>
              </div>
              {ttsLoading && (
                <div className="mt-2 text-sm text-gray-600">Speaking…</div>
              )}
            </div>
          )}
        </div>
      )}
      
      {!dictationMode && !lastAnswerResult && !currentQuestion && <p className="text-center p-8">Loading next round...</p>}

      {dictationMode && (
        <DictationInlineView
          currentWord={currentDictWord}
          item={dictItem}
          meaning={dictMeaning}
          pos={dictPos}
          isFetchingAudio={isFetchingAudio}
          playTts={playTts}
          dictInput={dictInput}
          setDictInput={setDictInput}
          lastDiff={lastDiff}
          correctFlash={correctFlash}
          dictIdx={dictIdx}
          totalCount={dictationWords.length}
          handleDictationSubmit={handleDictationSubmit}
          advanceAfterWrong={advanceAfterWrong}
        />
      )}

      {/* Inline auto audio panel above replaces bottom toast */}

      {showDictationPrompt && !dictationMode && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
          <div className="bg-white rounded-lg shadow-2xl p-8 space-y-5 w-full max-w-md m-4">
            <h2 className="text-2xl font-bold text-center">Learning Complete</h2>
            <p className="text-gray-700 text-center">Start dictation practice to reinforce spelling?</p>
            <div className="grid grid-cols-1 gap-3 mt-4">
              <button onClick={startDictation} className="w-full bg-purple-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-purple-700">Start Dictation</button>
              <button onClick={() => { setShowDictationPrompt(false); onSessionEnd(); }} className="w-full bg-gray-200 text-gray-900 px-6 py-3 rounded-md font-semibold hover:bg-gray-300">Finish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PreTestSession = ({ items, onPreTestComplete, isPureMode }) => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState([]);
  const [incorrectAnswers, setIncorrectAnswers] = useState([]);
  const [autoAudio, setAutoAudio] = useState(() => getAutoAudioPref(false));
  const [ttsLoading, setTtsLoading] = useState(false);

  const preTestQuestions = useMemo(() => {
    return items.map(item => {
      const distractors = generateDistractors(item, items, 6, 'word');
      return {
        word: item.word,
        stage: 4,
        item: item,
        options: shuffleArray([item.word, ...distractors])
      };
    });
  }, [items]);

  const handleAnswerSubmit = async (answer) => {
    if (ttsLoading) return;
    const currentQuestion = preTestQuestions[questionIndex];
    const isCorrect = getCleanWord(answer).toLowerCase() === getCleanWord(currentQuestion.word).toLowerCase();
    const updatedCorrect = isCorrect ? [...correctAnswers, currentQuestion.word] : correctAnswers;
    const updatedIncorrect = !isCorrect ? [...incorrectAnswers, currentQuestion.word] : incorrectAnswers;

    setCorrectAnswers(updatedCorrect);
    setIncorrectAnswers(updatedIncorrect);

    if (autoAudio && isCorrect) {
      try {
        setTtsLoading(true);
        await playTTSOnceWait(getCleanWord(currentQuestion.word), 2400);
      } catch (_) {
      } finally {
        setTtsLoading(false);
      }
    }

    const nextIndex = questionIndex + 1;
    if (nextIndex < preTestQuestions.length) {
      setQuestionIndex(nextIndex);
    } else {
      onPreTestComplete(updatedCorrect, updatedIncorrect);
    }
  };
  
  const currentQuestion = preTestQuestions[questionIndex];
  const progress = ((questionIndex) / preTestQuestions.length) * 100;

  

  return (
    <div className="mt-6 p-4 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold text-blue-800">Pre-test</h3>
          <button
            onClick={() => setAutoAudio(prev => { const next = !prev; setAutoAudioPref(next); return next; })}
            className={`px-2 py-1 text-sm rounded border ${autoAudio ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200' : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'}`}
          >
            Auto audio: {autoAudio ? 'ON' : 'OFF'}
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">Let’s see which words you already know. This does not affect your final score.</p>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>

        {currentQuestion ? (
            <QuestionView question={currentQuestion} onSubmit={handleAnswerSubmit} isPureMode={isPureMode} />
        ) : (
            <p>Loading pre-test...</p>
        )}
        {ttsLoading && (
          <div className="mt-3 text-center text-sm text-gray-600">Speaking…</div>
        )}
    </div>
  );
};

const PreTestResultsModal = ({ knownWords, onConfirm, isPureMode }) => {
  const [selectedWords, setSelectedWords] = useState(() => {
    const initialState = {};
    knownWords.forEach(word => {
      initialState[word] = false; // Default to not reviewing (i.e., skipping)
    });
    return initialState;
  });

  const handleToggle = (word) => {
    setSelectedWords(prev => ({ ...prev, [word]: !prev[word] }));
  };

  const handleSelectAll = () => {
    const allSelected = {};
    knownWords.forEach(word => { allSelected[word] = true; });
    setSelectedWords(allSelected);
  };

  const handleDeselectAll = () => {
    const noneSelected = {};
    knownWords.forEach(word => { noneSelected[word] = false; });
    setSelectedWords(noneSelected);
  };

  const handleSubmit = () => {
    const wordsToKeep = Object.entries(selectedWords)
      .filter(([, isSelected]) => isSelected)
      .map(([word]) => word);
    onConfirm(wordsToKeep);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 space-y-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <h2 className="text-2xl font-bold">Pre-test Complete</h2>
        <p className="text-gray-600">
          The following words are judged as “mastered” and will be skipped by default.
          To include any of them in this session, select the corresponding words.
        </p>
        
        <div className="flex-grow overflow-y-auto space-y-2 pr-2">
          {knownWords.map(word => (
            <div key={word} className="flex items-center p-3 border rounded-md bg-gray-50">
              <input
                type="checkbox"
                id={`word-${word}`}
                checked={selectedWords[word]}
                onChange={() => handleToggle(word)}
                className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor={`word-${word}`} className="ml-3 text-lg font-medium text-gray-800">
                {isPureMode ? getCleanWord(word) : word}
              </label>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="space-x-2">
            <button onClick={handleSelectAll} className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded hover:bg-blue-600">Select all to include</button>
            <button onClick={handleDeselectAll} className="px-4 py-2 text-sm font-semibold text-white bg-gray-500 rounded hover:bg-gray-600">Skip all (recommended)</button>
          </div>
          <button onClick={handleSubmit} className="bg-green-600 text-white px-8 py-3 rounded-md font-bold text-lg hover:bg-green-700">
            Start learning selected words
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Page Component ---
const WordPracticePage = () => {
  const [searchParams] = useSearchParams();
  const autostartHandledRef = useRef(false);
  const navigate = useNavigate();
  const [tier, setTier] = useState(null);
  const [studentTier, setStudentTier] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('mode-selection');
  const [practiceMode, setPracticeMode] = useState(null);
  const [isPureMode, setIsPureMode] = useState(false);
  
  const [wordsToLearn, setWordsToLearn] = useState([]);
  const [wordsToReview, setWordsToReview] = useState([]);
  const [teacherAssigned, setTeacherAssigned] = useState([]);
  const [priorityWordbookId, setPriorityWordbookId] = useState('');
  const [priorityWords, setPriorityWords] = useState([]);

  const [allQuizItems, setAllQuizItems] = useState([]);
  const [learningItems, setLearningItems] = useState([]);
  const [initialProgress, setInitialProgress] = useState({});
  const [pretestSkipped, setPretestSkipped] = useState([]);
  const [extraDictationWords, setExtraDictationWords] = useState([]);
  
  const [preTestResults, setPreTestResults] = useState({ correct: [], incorrect: [] });
  const [resumeRoundWords, setResumeRoundWords] = useState(null);
  const [resumeQuestionIndex, setResumeQuestionIndex] = useState(0);
  const [desiredLearnCount, setDesiredLearnCount] = useState(10);

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAuto, setPendingAuto] = useState(null);
  const [allowAutoStart, setAllowAutoStart] = useState(false);
  const [focusWords, setFocusWords] = useState([]);
  const [showPreviewList, setShowPreviewList] = useState(true);
  const [previewPage, setPreviewPage] = useState(1);

  // Minimal persistence helpers (simple, no TTL)
  const LAST_KEY = 'wp_last_session';              // last chosen mode + tier
  const RESUME_KEY = 'wp_resume_v1';               // snapshot for active learning session
  const saveLastSession = (data) => { try { localStorage.removeItem(RESUME_KEY); localStorage.setItem(LAST_KEY, JSON.stringify(data)); } catch {} };
  const loadLastSession = () => { try { const raw = localStorage.getItem(LAST_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const clearLastSession = () => { try { localStorage.removeItem(LAST_KEY); } catch {} };
  const saveResume = (data) => { try { localStorage.removeItem(LAST_KEY); localStorage.setItem(RESUME_KEY, JSON.stringify(data)); } catch {} };
  const loadResume = () => { try { const raw = localStorage.getItem(RESUME_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const clearResume = () => { try { localStorage.removeItem(RESUME_KEY); } catch {} };

  

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error("Authentication not found. Please log in again.");
        
        const summaryRes = await fetch('/api/student/dashboard-summary', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!summaryRes.ok) throw new Error('Failed to fetch your study data.');
        const summary = await summaryRes.json();
        setSummary(summary || {});
        setStudentTier(summary.tier || 'tier_3');
        const tbm = Array.isArray(summary.to_be_mastered)
          ? summary.to_be_mastered.map(x => (typeof x === 'string' ? x : x.word)).filter(Boolean)
          : [];
        setWordsToLearn(tbm);
        const tAssigned = Array.isArray(summary.teacher_assigned) ? summary.teacher_assigned : [];
        setTeacherAssigned(tAssigned);

        // Load learning preference and its TBM intersection
        try {
          const prefRes = await fetch('/api/student/learning-preference', { headers: { 'Authorization': `Bearer ${token}` } });
          const pref = await prefRes.json().catch(()=>({}));
          const wbId = pref?.priority_wordbook_id || '';
          setPriorityWordbookId(wbId || '');
          if (wbId) {
            const interRes = await fetch(`/api/student/wordbooks/${encodeURIComponent(wbId)}/tbm-words`, { headers: { 'Authorization': `Bearer ${token}` } });
            const inter = await interRes.json().catch(()=>({}));
            setPriorityWords(Array.isArray(inter?.words) ? inter.words : []);
          } else {
            setPriorityWords([]);
          }
        } catch (_) {}

        const reviewRes = await fetch('/api/student/review-words', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!reviewRes.ok) throw new Error('Failed to fetch your review list.');
        const reviewWords = await reviewRes.json();
        setWordsToReview(reviewWords);

      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // Read autostart params from URL exactly once (using window.location.search snapshot)
  useEffect(() => {
    if (autostartHandledRef.current) return;
    const sp = new URLSearchParams(window.location.search || '');
    const autostart = sp.get('autostart');
    const fw = sp.get('focus_words');
    if (fw) {
      const list = fw.split(',').map(s => s.trim()).filter(Boolean);
      setFocusWords(list);
    }
    if (autostart === '1') {
      const mode = sp.get('mode') || 'learn';
      const tierParam = sp.get('tier');
      setPracticeMode(mode);
      setPendingAuto({ mode, tier: tierParam });
      setSessionStatus('tier-selection');
      if (tierParam) setTier(tierParam);
      setAllowAutoStart(true);
      autostartHandledRef.current = true;
      return;
    }
    const mode = sp.get('mode');
    if (mode === 'learn' || mode === 'review') {
      setPracticeMode(mode);
      setSessionStatus('tier-selection');
      const t = sp.get('tier');
      if (t) setTier(t);
      setAllowAutoStart(false);
    }
    autostartHandledRef.current = true;
  }, []);

  useEffect(() => {
    if (pendingAuto && studentTier && sessionStatus !== 'loading') {
      const t = pendingAuto.tier || studentTier || 'tier_3';
      if (pendingAuto.mode === 'learn') startLearnSession(t);
      else if (pendingAuto.mode === 'review') startReviewSession(t);
      setPendingAuto(null);
    }
  }, [pendingAuto, studentTier, sessionStatus]);

  const availableTiers = useMemo(() => {
    // 教师设定与难度权限：
    // - tier1（最高水平，表现突出）：只能选 拔高 → ['tier_1']
    // - tier2（稳定成长）：可选 困难/拔高 → ['tier_2','tier_1']
    // - tier3（需要支持，最低水平）：三个难度均可 → ['tier_3','tier_2','tier_1']
    if (studentTier === 'tier_1') return ['tier_1'];
    if (studentTier === 'tier_2') return ['tier_2', 'tier_1'];
    return ['tier_3', 'tier_2', 'tier_1'];
  }, [studentTier]);

  // Clamp desiredLearnCount to available range when data changes
  useEffect(() => {
    if (practiceMode === 'learn') {
      const total = wordsToLearn.length;
      if (total > 0) {
        const next = Math.min(Math.max(1, desiredLearnCount || 10), total);
        if (next !== desiredLearnCount) setDesiredLearnCount(next);
      }
    }
  }, [practiceMode, wordsToLearn, desiredLearnCount]);

  const handleModeSelect = (mode) => {
    setPracticeMode(mode);
    setSessionStatus('tier-selection');
  };

  // 自动选择：tier1（表现突出）进入难度页时自动选中“拔高”（tier_1）
  useEffect(() => {
    if (sessionStatus === 'tier-selection' && !tier) {
      if (studentTier === 'tier_1') setTier('tier_1');
    }
  }, [sessionStatus, studentTier, tier]);

  const updateWordReviewOnBackend = async (word, result) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication not found");
      
      await fetch('/api/student/update-word-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ word, result }),
      });
    } catch (error) {
      console.error(`Failed to update review status for ${word}:`, error);
      // Optionally, add some user-facing error handling here
    }
  };

  const masterWordsOnBackend = async (masteredWords) => {
    // Accept both a single word or an array for convenience
    const wordsArray = Array.isArray(masteredWords) ? masteredWords : [masteredWords];
    if (wordsArray.length === 0) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication not found");
      
      await fetch('/api/student/master-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ words: wordsArray }),
      });
    } catch (error) {
      console.error("Failed to update mastered words on backend:", error);
    }
  };

  // Split start flows to avoid any mode confusion
  const startLearnSession = async (tierOverride = null) => {
    const tierToUse = tierOverride ?? tier;
    if (!tierToUse) {
      setError("Please choose a difficulty level.");
      return;
    }
    setSessionStatus('loading');
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication not found. Please log in again.");

      // Pull latest to_be_mastered list
      const summaryRes = await fetch('/api/student/dashboard-summary', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!summaryRes.ok) throw new Error('Failed to fetch your study data.');
      const summary = await summaryRes.json();
      let prioritized = [];
      if (focusWords && focusWords.length > 0) {
        prioritized = focusWords.map(getCleanWord);
      } else {
        const rawList = Array.isArray(summary.to_be_mastered)
          ? summary.to_be_mastered.map(x => (typeof x === 'string' ? x : x.word)).filter(Boolean)
          : [];
        const teacherList = Array.isArray(summary.teacher_assigned) ? summary.teacher_assigned : [];
        // priority: teacher first, then others
        const teacherSet = new Set(teacherList.map(getCleanWord));
        const otherRaw = rawList.filter(w => !teacherSet.has(getCleanWord(w)));
        // Reorder others by priority words (if set)
        const pset = new Set(priorityWords.map(getCleanWord));
        const otherList = otherRaw
          .map((w, idx) => ({ w, idx, s: pset.has(getCleanWord(w)) ? 1 : 0 }))
          .sort((a,b)=> (b.s - a.s) || (a.idx - b.idx))
          .map(x=>x.w);
        prioritized = [...teacherList.map(getCleanWord), ...otherList.map(getCleanWord)];
      }

      const totalCount = prioritized.length;
      if (totalCount === 0) {
        setError("No words to practice.");
        setSessionStatus('mode-selection');
        return;
      }

      // If focus_words present, use them all; otherwise respect selected count
      const wordList = (focusWords && focusWords.length > 0)
        ? prioritized
        : prioritized.slice(0, Math.max(1, Math.min(Number.isFinite(desiredLearnCount) ? desiredLearnCount : 10, totalCount)));
      setWordsToLearn(wordList);

      const items = await fetchPracticeSessionData(wordList, tierToUse, token);

      const returnedWords = new Set(items.map(item => item.word));
      const wordsToClean = wordList.filter(word => !returnedWords.has(word));
      if (wordsToClean.length > 0) {
        console.log("Cleaning up non-existent words:", wordsToClean);
        wordsToClean.forEach(word => {
          fetch('/api/student/word/cleanup', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ word: word }),
          });
        });
      }

      const transformedItems = items.map((item) => ({
        word: item.word,
        word_root: item.word_root,
        definition: { cn: item.definition_cn, en: item.definition_en },
        sample_sentences: item.sample_sentences,
        exercises: item.exercises,
      }));

      setAllQuizItems(transformedItems);
      // 进入预习页（列表 + 闪卡），由用户点击“预习完成”再进入测前评估
      setSessionStatus('preview');
      saveLastSession({ practiceMode: 'learn', tier: tierToUse });
      saveLastSession({ practiceMode: 'learn', tier: tierToUse });
    } catch (err) {
      setError(err.message);
      setSessionStatus('tier-selection');
    }
  };

  const startReviewSession = async (tierOverride = null) => {
    const tierToUse = tierOverride ?? tier;
    if (!tierToUse) {
      setError("Please choose a difficulty level.");
      return;
    }
    setSessionStatus('loading');
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication not found. Please log in again.");

      // Pull latest review list based on spaced repetition schedule
      const reviewRes = await fetch('/api/student/review-words', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!reviewRes.ok) throw new Error('Failed to fetch your review list.');
      const reviewWords = (await reviewRes.json()).map(getCleanWord);
      setWordsToReview(reviewWords);

      const wordList = reviewWords;
      if (wordList.length === 0) {
        setError("No words to practice.");
        setSessionStatus('mode-selection');
        return;
      }

      const items = await fetchPracticeSessionData(wordList, tierToUse, token);

      const returnedWords = new Set(items.map(item => item.word));
      const wordsToClean = wordList.filter(word => !returnedWords.has(word));
      if (wordsToClean.length > 0) {
        console.log("Cleaning up non-existent words:", wordsToClean);
        wordsToClean.forEach(word => {
          fetch('/api/student/word/cleanup', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ word: word }),
          });
        });
      }

      const transformedItems = items.map((item) => ({
        word: item.word,
        word_root: item.word_root,
        definition: { cn: item.definition_cn, en: item.definition_en },
        sample_sentences: item.sample_sentences,
        exercises: item.exercises,
      }));

      setAllQuizItems(transformedItems);
      setSessionStatus('pre-test');
      saveLastSession({ practiceMode: 'review', tier: tierToUse });
    } catch (err) {
      setError(err.message);
      setSessionStatus('tier-selection');
    }
  };

  // 仅在明确允许自动开始时（URL 带 autostart=1）才自动开练
  useEffect(() => {
    if (
      allowAutoStart &&
      sessionStatus === 'tier-selection' &&
      studentTier === 'tier_1' &&
      tier === 'tier_1' &&
      (practiceMode === 'learn' || practiceMode === 'review')
    ) {
      if (practiceMode === 'learn') startLearnSession('tier_1');
      else startReviewSession('tier_1');
    }
  }, [allowAutoStart, sessionStatus, studentTier, tier, practiceMode]);

  const handlePreTestComplete = (correct, incorrect) => {
    if (practiceMode === 'review') {
      // Mark correct words as reviewed and passed
      correct.forEach(word => updateWordReviewOnBackend(word, 'pass'));
      // Dictation for review includes all review words
      const allReview = (wordsToReview || []).slice();
      setExtraDictationWords(allReview);
      if (incorrect.length > 0) {
        // Learn the incorrect first, then dictation will include all
        handleStartLearningSession(incorrect, []);
      } else {
        // Skip relearning and go straight to dictation pane via a lightweight learning session
        // Initialize a minimal learning session so QuizSession can render and immediately prompt dictation
        const progress = {};
        allReview.forEach(w => { progress[w] = { stage: 5, status: 'mastered', last_result: 'correct' }; });
        setLearningItems(allQuizItems.filter(it => allReview.includes(it.word)));
        setInitialProgress(progress);
        setSessionStatus('learning');
      }
    } else { // 'learn' mode
      setPreTestResults({ correct, incorrect });
      if (correct.length > 0) {
        setSessionStatus('pre-test-results');
      } else {
        handleStartLearningSession(incorrect, []);
      }
    }
  };

  const handleStartLearningSession = (wordsToLearn, wordsToReview = []) => {
    const finalWordList = [...new Set([...wordsToLearn, ...wordsToReview])];
    const progress = {};
    finalWordList.forEach(word => {
      progress[word] = { stage: 1, status: 'learning', last_result: null };
    });
    
    const itemsForLearning = allQuizItems.filter(item => finalWordList.includes(item.word));
    setLearningItems(itemsForLearning);
    setInitialProgress(progress);
    setSessionStatus('learning');

    // Save a snapshot for resume
    saveResume({
      sessionStatus: 'learning',
      practiceMode,
      tier,
      learningItems: itemsForLearning,
      wordProgress: progress,
      currentRoundWords: null,
      questionIndex: 0,
    });

    // Clear any previous resume order state in UI
    setResumeRoundWords(null);
    setResumeQuestionIndex(0);
  };

  const handleConfirmPreTestChoices = (wordsToKeep) => {
    if (practiceMode === 'learn') {
      const wordsToSkip = preTestResults.correct.filter(word => !wordsToKeep.includes(word));
      if (wordsToSkip.length > 0) {
        masterWordsOnBackend(wordsToSkip);
        setWordsToLearn(prev => prev.filter(w => !wordsToSkip.includes(w)));
      }
      setPretestSkipped(wordsToSkip);
    }
    handleStartLearningSession(preTestResults.incorrect, wordsToKeep);
  };

  const handleSessionEnd = () => {
    setSessionStatus('finished');
    clearLastSession();
    clearResume();
    setResumeRoundWords(null);
    setResumeQuestionIndex(0);
  };

  // On mount, offer resume. Prefer in-progress learning snapshot; fallback to last session params.
  useEffect(() => {
    if (sessionStatus !== 'mode-selection') return;

    const resume = loadResume();
    if (resume && resume.sessionStatus === 'learning' && Array.isArray(resume.learningItems) && resume.wordProgress) {
      const ok = window.confirm('Detected ongoing progress. Resume?');
      if (ok) {
        setPracticeMode(resume.practiceMode || null);
        setTier(resume.tier || null);
        setLearningItems(resume.learningItems || []);
        setInitialProgress(resume.wordProgress || {});
        setSessionStatus('learning');
        if (Array.isArray(resume.currentRoundWords) && resume.currentRoundWords.length > 0) {
          setResumeRoundWords(resume.currentRoundWords);
          setResumeQuestionIndex(resume.questionIndex || 0);
        } else {
          setResumeRoundWords(null);
          setResumeQuestionIndex(0);
        }
        return; // do not check LAST_KEY if learning resume exists
      } else {
        clearResume();
      }
    }

    const last = loadLastSession();
    if (!last) return;
    const ok = window.confirm('Unfinished practice detected. Restore last settings and restart?');
    if (ok) {
      if (last.practiceMode === 'learn') {
        startLearnSession(last.tier);
      } else if (last.practiceMode === 'review') {
        startReviewSession(last.tier);
      }
      // Reflect into state for UI only
      setPracticeMode(last.practiceMode || null);
      setTier(last.tier || null);
    } else {
      clearLastSession();
    }
  }, [sessionStatus]);
  
  // One-click from WordPractice: TBM (teacher-first) + supplement from priority wordbook
  const handleOneClickLearnHere = async () => {
    try {
      const usedLearned = (typeof summary?.secret_today_learned === 'number') ? summary.secret_today_learned : 0;
      const remaining = Math.max(0, (summary?.learning_goal || 0) - usedLearned);
      const tbm = Array.isArray(summary?.to_be_mastered) ? summary.to_be_mastered : [];
      const tbmWords = tbm.map(x => (typeof x === 'string' ? x : x.word)).filter(Boolean);
      const teacherSet = new Set((summary?.teacher_assigned || []).map(w => w));
      const teacherFirst = []; const others = [];
      for (const w of tbmWords) { if (teacherSet.has(w)) teacherFirst.push(w); else others.push(w); }
      const orderedTBM = [...teacherFirst, ...others];
      const tbmCount = (summary?.has_teacher === true) ? orderedTBM.length : 0;
      const desired = tbmCount + remaining;
      if (desired <= 0) return; // nothing to do
      const base = orderedTBM.slice(0, desired);
      let combined = [...base];
      const need = Math.max(0, desired - combined.length);
      if (need > 0) {
        // Supplement from priorityWords fetched via preference
        const sup = (priorityWords || []).filter(Boolean).filter(w => !new Set(combined).has(w));
        combined = [...combined, ...sup.slice(0, need)];
      }
      if (combined.length === 0) return;
      const params = new URLSearchParams();
      params.set('mode', 'learn');
      params.set('tier', tier || studentTier || summary?.tier || 'tier_3');
      params.set('autostart', '1');
      params.set('focus_words', combined.join(','));
      navigate(`/student/word-practice?${params.toString()}`);
    } catch (_) {}
  };

  const renderContent = () => {
    // 顶部快捷一键学习按钮，显示剩余与布置
    const QuickButton = () => {
      const usedLearned = (typeof summary?.secret_today_learned === 'number') ? summary.secret_today_learned : 0;
      const remaining = Math.max(0, (summary?.learning_goal || 0) - usedLearned);
      const tbm = Array.isArray(summary?.to_be_mastered) ? summary.to_be_mastered : [];
      const assignedCount = (summary?.has_teacher === true) ? tbm.length : 0;
      const hasLeft = remaining > 0;
      const btnClass = hasLeft ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700';
      const btnText = hasLeft ? `One-click Learn (${remaining} left)` : `Completed today's learning — learned ${usedLearned} words`;
      return (
        <div className="flex justify-between items-center mb-3">
          <div className={`text-sm ${hasLeft ? 'text-purple-700' : 'text-green-700'}`}>
            Today left: <span className="font-semibold">{remaining}</span>
            {assignedCount > 0 && (
              <>
                <span className="mx-2 text-gray-400">|</span>
                Assigned TBM: <span className="font-semibold">{assignedCount}</span>
              </>
            )}
          </div>
          <button
            onClick={hasLeft ? handleOneClickLearnHere : undefined}
            disabled={!hasLeft}
            className={`px-3 py-1.5 text-sm text-white rounded ${btnClass} disabled:opacity-80`}
          >
            {btnText}
          </button>
        </div>
      );
    };
    if (isLoading) {
      return (
        <div>
          <p className="text-center p-8">Loading your study data...</p>
        </div>
      );
    }
    if (error && sessionStatus === 'mode-selection') {
        return (
          <div>
            <QuickButton />
            <p className="text-center p-8 text-red-500">{error}</p>
          </div>
        );
    }

    switch (sessionStatus) {
        case 'loading':
            return (
              <div>
                <p className="text-center p-8">Preparing practice...</p>
              </div>
            );
        case 'preview':
            return (
              <div className="bg-white p-6 rounded-lg shadow">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">Preview</h1>
                <p className="text-center text-gray-600 mb-6">Preview words to learn; supports quick flashcards</p>

                {/* Toggle */}
                <div className="flex justify-end mb-3">
                  <button
                    className="text-sm px-3 py-1 rounded border bg-white hover:bg-gray-50"
                    onClick={() => setShowPreviewList(v => !v)}
                  >
                    {showPreviewList ? 'Show flashcards only' : 'Show word list'}
                  </button>
                </div>

                {/* Word list CN-EN */}
                {showPreviewList && (() => {
                  const perPage = 10;
                  const total = allQuizItems.length;
                  const totalPages = Math.max(1, Math.ceil(total / perPage));
                  const page = Math.min(Math.max(1, previewPage), totalPages);
                  const start = (page - 1) * perPage;
                  const pageItems = allQuizItems.slice(start, start + perPage);
                  const goPrev = () => setPreviewPage(p => Math.max(1, p - 1));
                  const goNext = () => setPreviewPage(p => Math.min(totalPages, p + 1));
                  return (
                  <div className="overflow-x-auto mb-6">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="p-2 text-left">Word</th>
                          <th className="p-2 text-left">Chinese definition</th>
                          <th className="p-2 text-left">English definition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pageItems.map((it) => (
                          <tr key={it.word}>
                            <td className="p-2 font-semibold text-gray-900 flex items-center gap-2">
                              <span>{it.word}</span>
                              <button
                                title="Play pronunciation"
                                className="p-1 rounded hover:bg-gray-100"
                                onClick={() => playTTS(getCleanWord(it.word))}
                              >
                                <SpeakerWaveIcon className="h-5 w-5 text-gray-600" />
                              </button>
                            </td>
                            <td className="p-2 text-gray-800">{it.definition.cn}</td>
                            <td className="p-2 text-gray-700">{it.definition.en}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                      <div className="flex gap-2">
                        <button onClick={goPrev} disabled={page===1} className="px-3 py-1 bg-white border rounded disabled:opacity-50">Previous</button>
                        <button onClick={goNext} disabled={page===totalPages} className="px-3 py-1 bg-white border rounded disabled:opacity-50">Next</button>
                      </div>
                    </div>
                  </div>
                  );})()}

                {/* Simple flashcards */}
                <PreviewFlashcards items={allQuizItems} />

                <button
                  onClick={() => setSessionStatus('pre-test')}
                  className="mt-6 w-full bg-indigo-600 text-white px-6 py-3 rounded-md font-semibold text-lg hover:bg-indigo-700"
                >
                  Finish Preview
                </button>
              </div>
            );
        case 'pre-test':
            return (
              <div>
                <QuickButton />
                <PreTestSession items={allQuizItems} onPreTestComplete={handlePreTestComplete} isPureMode={isPureMode} />
              </div>
            );
        case 'learning':
            return <QuizSession 
                        items={learningItems} 
                        initialProgress={initialProgress} 
                        onSessionEnd={handleSessionEnd} 
                        onWordRelearned={(word) => {
                          if (practiceMode === 'review') {
                            updateWordReviewOnBackend(word, 'fail');
                          } else {
                            masterWordsOnBackend([word]);
                            setWordsToLearn(prev => prev.filter(w => w !== word));
                          }
                        }}
                        isPureMode={isPureMode}
                        setIsPureMode={setIsPureMode}
                        practiceMode={practiceMode}
                        tier={tier}
                        resumeRoundWords={resumeRoundWords}
                        resumeQuestionIndex={resumeQuestionIndex}
                        pretestSkipped={pretestSkipped}
                        extraDictationWords={extraDictationWords}
                        fullItems={allQuizItems}
                        onDictationComplete={(words)=>{
                          if (practiceMode === 'review') {
                            // mark all as passed for today
                            (words || []).forEach(w => updateWordReviewOnBackend(w, 'pass'));
                          } else {
                            masterWordsOnBackend(words || []);
                          }
                        }}
                    />;
        case 'finished':
            return (
                <div className="bg-white p-8 rounded-lg shadow-md text-center">
                    <SparklesIcon className="mx-auto h-16 w-16 text-green-500" />
                    <h1 className="mt-4 text-4xl font-extrabold text-gray-900">Practice complete!</h1>
                    <p className="mt-2 text-lg text-gray-600">Great job! Keep it up!</p>
                    <button onClick={() => navigate('/student/dashboard')} className="mt-8 w-full bg-blue-600 text-white px-8 py-4 rounded-md font-bold text-xl hover:bg-blue-700">
                        Back to main menu
                    </button>
                </div>
            );
        case 'tier-selection':
            // 显示顺序：普通（tier_3）→ 困难（tier_2）→ 拔高（tier_1）
            const allTiers = ['tier_3', 'tier_2', 'tier_1'];
            // 难度与数据层映射：
            // - 拔高 → 使用题目数据的 tier_1
            // - 困难 → 使用题目数据的 tier_2
            // - 普通 → 使用题目数据的 tier_3
            const labelByTier = { tier_3: 'Normal', tier_2: 'Advanced', tier_1: 'Challenge' };
            
            return (
                <div className="bg-white p-8 rounded-lg shadow-md text-center">
                    <BeakerIcon className="mx-auto h-12 w-12 text-purple-600" />
                    <h1 className="mt-4 text-4xl font-extrabold text-gray-900">Word Practice</h1>
                    <p className="mt-2 text-lg text-gray-600">Choose quantity and difficulty before starting.</p>
                    
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {allTiers.map((t) => {
                            const isAvailable = availableTiers.includes(t);
                            const isSelected = tier === t;
                            
                            return (
                                <button 
                                    key={t} 
                                    onClick={() => isAvailable && setTier(t)} 
                                    disabled={!isAvailable}
                                    className={`p-6 rounded-lg font-bold text-xl transition-all duration-200 ${
                                        isSelected 
                                            ? 'bg-purple-600 text-white shadow-lg scale-105' 
                                            : isAvailable 
                                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    {labelByTier[t]}
                                    {!isAvailable && (
                                        <span className="block text-sm mt-2">(Unavailable)</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {practiceMode === 'learn' && focusWords.length === 0 && (
                      <div className="mt-8 text-left">
                        <div className="p-4 rounded-lg border bg-indigo-50 border-indigo-200">
                          <div className="font-bold text-indigo-900 mb-2">How many to study this time?</div>
                          <div className="text-indigo-800 text-sm mb-3">
                            Available: {wordsToLearn.length}
                            {teacherAssigned.length > 0 && (
                              <>; assigned {teacherAssigned.length}, self-study {Math.max(0, wordsToLearn.length - teacherAssigned.length)}</>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="1"
                              max={Math.max(1, wordsToLearn.length)}
                              value={Math.min(desiredLearnCount || 1, Math.max(1, wordsToLearn.length))}
                              onChange={(e)=>setDesiredLearnCount(parseInt(e.target.value, 10))}
                              className="flex-1"
                            />
                            <input
                              type="number"
                              min="1"
                              max={Math.max(1, wordsToLearn.length)}
                              value={desiredLearnCount || 1}
                              onChange={(e)=>setDesiredLearnCount(Math.min(Math.max(1, parseInt(e.target.value || '1', 10)), Math.max(1, wordsToLearn.length)))}
                              className="w-24 p-2 border rounded"
                            />
                          </div>
                          <div className="text-xs text-indigo-700 mt-2">
                            Default: prioritize assigned words, then supplement with self-study.
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {error && <p className="mt-4 text-red-500 font-semibold">{error}</p>}
                    
                    <div className="mt-8">
                        <button 
                            onClick={() => {
                              if (practiceMode === 'learn') startLearnSession(tier);
                              else if (practiceMode === 'review') startReviewSession(tier);
                              else {
                                setError('Unrecognized practice mode. Please go back and select again.');
                              }
                            }} 
                            disabled={!tier || (practiceMode !== 'learn' && practiceMode !== 'review')} 
                            className="w-full bg-green-600 text-white px-8 py-4 rounded-md font-bold text-xl hover:bg-green-700 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            Start
                        </button>
                    </div>
                </div>
            );
        case 'mode-selection':
        default:
            return (
                <div className="bg-white p-8 rounded-lg shadow-md text-center">
                    <h1 className="text-4xl font-extrabold text-gray-900">What to learn today?</h1>
                    <p className="mt-2 text-lg text-gray-600">Choose a mode to start your learning journey.</p>
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Learn Words */}
                        <div className="flex flex-col">
                            {wordsToLearn.length > 0 ? (
                                <button onClick={() => handleModeSelect('learn')} className="p-8 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-all transform hover:scale-105 shadow-lg">
                                    <BookOpenIcon className="mx-auto h-12 w-12" />
                                    <h2 className="mt-4 text-2xl font-bold">Learn new words</h2>
                                    <p className="mt-2 text-4xl font-black">{wordsToLearn.length}</p>
                                    <p>new words</p>
                                    {teacherAssigned.length > 0 && (
                                      <p className="mt-2 text-sm opacity-90">Assigned {teacherAssigned.length}, self-study {Math.max(0, wordsToLearn.length - teacherAssigned.length)}</p>
                                    )}
                                </button>
                            ) : (
                                <div className="p-8 rounded-lg bg-green-100 text-green-800 text-center border-2 border-green-200">
                                    <SparklesIcon className="mx-auto h-12 w-12" />
                                    <h2 className="mt-4 text-2xl font-bold">No new words!</h2>
                                    <p className="mt-2 text-lg">You’ve completed all assigned tasks. Great discipline!</p>
                                    <div className="mt-6 text-gray-700">
                                      Want to keep learning? Click
                                      <button
                                        type="button"
                                        onClick={() => navigate('/student/dashboard?openQuick=1')}
                                        className="mx-2 inline-flex items-center px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                      >
                                        Learn Now
                                      </button>
                                      , to supplement new words from other wordbooks.
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Review Words */}
                        <div className="flex flex-col">
                            {wordsToReview.length > 0 ? (
                                <button onClick={() => handleModeSelect('review')} className="p-8 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-all transform hover:scale-105 shadow-lg">
                                    <SparklesIcon className="mx-auto h-12 w-12" />
                                    <h2 className="mt-4 text-2xl font-bold">Review old words</h2>
                                    <p className="mt-2 text-4xl font-black">{wordsToReview.length}</p>
                                    <p>to review</p>
                                </button>
                            ) : (
                                <div className="p-8 rounded-lg bg-green-100 text-green-800 text-center border-2 border-green-200">
                                    <SparklesIcon className="mx-auto h-12 w-12" />
                                    <h2 className="mt-4 text-2xl font-bold">No reviews today!</h2>
                                    <p className="mt-2 text-lg">Everything is firmly remembered — proud of you!</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        {sessionStatus === 'pre-test-results' && (
            <PreTestResultsModal 
              knownWords={preTestResults.correct}
              onConfirm={handleConfirmPreTestChoices}
              isPureMode={isPureMode}
            />
        )}
        {renderContent()}
      </div>
    </main>
  );
};

export default WordPracticePage;

// --- Simple Flashcards for Preview ---
const PreviewFlashcards = ({ items }) => {
  const [index, setIndex] = React.useState(0);
  const [showBack, setShowBack] = React.useState(false);
  const total = items.length || 0;
  const current = items[index] || null;

  if (total === 0) return null;

  const prev = () => { setShowBack(false); setIndex(i => (i > 0 ? i - 1 : total - 1)); };
  const next = () => { setShowBack(false); setIndex(i => (i < total - 1 ? i + 1 : 0)); };

  return (
    <div className="border rounded-md p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-600">Flashcard {index + 1}/{total}</div>
        <div className="flex gap-2">
          <button onClick={prev} className="px-3 py-1 bg-white border rounded hover:bg-gray-100">Previous</button>
          <button onClick={next} className="px-3 py-1 bg-white border rounded hover:bg-gray-100">Next</button>
        </div>
      </div>
      <div className="p-6 bg-white rounded border text-center">
        {!showBack ? (
          <div>
            <div className="text-gray-500 text-sm mb-2">Word</div>
            <div className="text-3xl font-extrabold text-gray-900 flex items-center justify-center gap-3">
              <span>{current.word}</span>
              <button title="Play pronunciation" onClick={() => playTTS(getCleanWord(current.word))} className="p-2 rounded hover:bg-gray-100">
                <SpeakerWaveIcon className="h-6 w-6 text-gray-700" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-gray-500 text-sm mb-2">Definition</div>
            <div className="text-lg font-semibold text-gray-800">{current.definition.cn}</div>
            <div className="text-sm text-gray-600 mt-1">{current.definition.en}</div>
          </div>
        )}
      </div>
      <div className="mt-3 text-center">
        <button onClick={() => setShowBack(s => !s)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showBack ? 'Show word' : 'Show definition'}
        </button>
      </div>
    </div>
  );
};
