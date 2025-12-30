import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

const API = '/api';

const formatToBeijingTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch (_) {
    return isoString;
  }
};

export default function ReviewAttemptPage() {
  const { resultId } = useParams();
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showIncorrectOnly, setShowIncorrectOnly] = useState(false);
  const [rescoring, setRescoring] = useState(new Set());
  const [pendingQuestionIdx, setPendingQuestionIdx] = useState(new Set());
  const [pendingVocabWords, setPendingVocabWords] = useState(new Set());
  const [savedQuestionIdx, setSavedQuestionIdx] = useState(new Set());
  const [savedVocabWords, setSavedVocabWords] = useState(new Set());
  const isAdminView = (() => {
    try { return new URLSearchParams(window.location.search).get('adminView') === '1'; } catch { return false; }
  })();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true); setError(null);
      try {
        const r = await fetch(`${API}/results/${resultId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed to fetch quiz result details.');
        setResult(j);
        // Auto-claim if result is anonymous so rescore can persist
        if (!j.username || j.username === '') {
          try {
            const cr = await fetch(`${API}/results/${resultId}/claim`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const cj = await cr.json().catch(() => ({}));
            if (cr.ok) setResult(cj);
          } catch {}
        }
      } catch (e) { setError(e.message || 'Failed to load'); }
      finally { setIsLoading(false); }
    };
    if (resultId) load();
  }, [resultId]);

  const filteredQuestions = useMemo(() => {
    if (!result?.details?.questions) return [];
    const list = result.details.questions;
    if (!showIncorrectOnly) return list;
    return list.filter(q => {
      if (q.type === 'sentence') return typeof q.score === 'number' && q.score < 3;
      return q.type === 'fill-in-the-blank' ? !q.correct : false;
    });
  }, [result, showIncorrectOnly]);

  const recalcTotals = (updated) => {
    const qs = updated?.details?.questions || [];
    let s = 0, t = 0;
    qs.forEach(q => {
      if (q.type === 'fill-in-the-blank') { t += 1; if (q.correct) s += 1; }
      else if (q.type === 'sentence') { t += 4; s += Math.max(0, Math.min(4, typeof q.score === 'number' ? q.score : 0)); }
    });
    updated.score = s; updated.total_score = t; return updated;
  };

  const rescoreQuestion = async (index, q) => {
    const ns = new Set(rescoring); ns.add(index); setRescoring(ns);
    try {
      const token = localStorage.getItem('token');
      let endpoint, payload;
      if (q.type === 'fill-in-the-blank') {
        endpoint = `${API}/ai/fill-in-blank-score`;
        payload = { prompt: q.prompt || q.sentence, answer: q.answer, word: q.word };
      } else {
        endpoint = `${API}/ai/sentence-score`;
        payload = { word: q.word, sentence: q.answer, definition: q.definition };
      }
      const attempt = async () => {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        const text = await r.text();
        if (r.ok) { try { return JSON.parse(text); } catch { throw new Error('RETRY'); } }
        try { const err = JSON.parse(text); if (String(err?.error || '').includes('internal scoring error')) throw new Error('RETRY'); } catch {}
        throw new Error('RETRY');
      };
      let data;
      try { data = await attempt(); }
      catch { await new Promise(r => setTimeout(r, 300)); try { data = await attempt(); } catch { data = null; } }
      if (!data) throw new Error('Rescoring failed');

      const updated = { ...result };
      const qs = [...(updated?.details?.questions || [])];
      const nq = { ...qs[index] };
      let question_update = {};
      if (q.type === 'fill-in-the-blank') { nq.correct = !!data.correct; nq.feedback = data.feedback || nq.feedback || ''; question_update = { correct: nq.correct, feedback: nq.feedback }; }
      else { nq.score = typeof data.score === 'number' ? data.score : 0; nq.feedback = data.feedback || nq.feedback || ''; question_update = { score: nq.score, feedback: nq.feedback }; }
      qs[index] = nq;
      updated.details = { ...(updated.details || {}), questions: qs };
      setResult(recalcTotals(updated));

      // Persist to server
      try {
        const rid = result?.id || result?._id || resultId;
        let pr = await fetch(`${API}/results/${rid}/rescore`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ question_index: index, question_update }) });
        if (pr.status === 403) {
          // Attempt claim then retry once
          try {
            await fetch(`${API}/results/${rid}/claim`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            pr = await fetch(`${API}/results/${rid}/rescore`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ question_index: index, question_update }) });
          } catch {}
        }
        if (pr.ok) {
          const saved = await pr.json();
          setResult(saved);
        }
      } catch {}
    } catch (e) {
      alert(e.message || 'Rescoring failed.');
    } finally {
      const ns2 = new Set(rescoring); ns2.delete(index); setRescoring(ns2);
    }
  };

  const handleToggleBookmarkQuestion = async (index, q) => {
    if (!result) return;
    const token = localStorage.getItem('token');
    try {
      const pend = new Set(pendingQuestionIdx); pend.add(index); setPendingQuestionIdx(pend);
      const rid = result._id || result.id || '';
      if (savedQuestionIdx.has(index)) {
        const r = await fetch(`${API}/user/bookmark-question`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ result_id: rid, question_index: index })
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) throw new Error(j.error || 'Failed to unbookmark');
        const ns = new Set(savedQuestionIdx); ns.delete(index); setSavedQuestionIdx(ns);
      } else {
        const payload = {
          prompt: q.prompt || `Sentence for "${q.word || ''}"`,
          word: q.word || '',
          correct_answer: q.type === 'fill-in-the-blank' ? (q.word || '') : null,
          user_answer: q.answer || '',
          ai_feedback: q.feedback || null,
          quiz_id: result.quiz_id || null,
          result_id: rid || null,
          question_index: index,
        };
        const r = await fetch(`${API}/user/bookmark-question`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) throw new Error(j.error || 'Failed to bookmark');
        const ns = new Set(savedQuestionIdx); ns.add(index); setSavedQuestionIdx(ns);
      }
    } catch (e) {
      alert(e.message || 'Bookmark action failed');
    } finally {
      const pend2 = new Set(pendingQuestionIdx); pend2.delete(index); setPendingQuestionIdx(pend2);
    }
  };

  const handleToggleVocab = async (q) => {
    const token = localStorage.getItem('token');
    try {
      const pend = new Set(pendingVocabWords); pend.add(q.word); setPendingVocabWords(pend);
      if (savedVocabWords.has(q.word)) {
        const r = await fetch(`${API}/user/save-vocab`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ word: q.word })
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) throw new Error(j.error || 'Failed to unsave vocab');
        const ns = new Set(savedVocabWords); ns.delete(q.word); setSavedVocabWords(ns);
      } else {
        const r = await fetch(`${API}/user/save-vocab`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ word: q.word, definition: q.definition })
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) throw new Error(j.error || 'Failed to save vocab');
        const ns = new Set(savedVocabWords); ns.add(q.word); setSavedVocabWords(ns);
      }
    } catch (e) {
      alert(e.message || 'Vocab action failed');
    } finally {
      const pend2 = new Set(pendingVocabWords); pend2.delete(q.word); setPendingVocabWords(pend2);
    }
  };

  if (isLoading) return <p className="p-6 text-center">Loading review...</p>;
  if (error) return <p className="p-6 text-center text-red-500">Error: {error}</p>;
  if (!result) return <p className="p-6 text-center">No result found.</p>;

  const { details, score, total_score, ts } = result;

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">{details?.name || 'Quiz'} - Review</h1>
      <p className="text-sm text-gray-500 mb-4">Attempt from: {formatToBeijingTime(ts)}</p>

      <div className="my-6 p-4 bg-gray-100 rounded-lg text-center">
        <h2 className="text-xl font-semibold">Final Score</h2>
        <p className="text-4xl font-bold text-blue-600">{score} / {total_score}</p>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowIncorrectOnly(v => !v)}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700"
        >
          {showIncorrectOnly ? 'Show All' : 'Show Incorrect Only'}
        </button>
      </div>

      <div className="space-y-4">
        {filteredQuestions.map((q, i) => {
          const isSentenceCorrect = q.type === 'sentence' && typeof q.score === 'number' && q.score >= 3;
          const isCorrect = q.type === 'fill-in-the-blank' ? !!q.correct : isSentenceCorrect;
          const points = q.type === 'fill-in-the-blank' ? (q.correct ? 1 : 0) : (typeof q.score === 'number' ? q.score : 0);
          const prompt = (q.prompt || q.sentence || '').replace('___', `[${q.word}]`) || `Sentence for "${q.word}"`;
          return (
            <div key={i} className={`border-l-4 p-4 rounded-md ${isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
              <div className="flex justify-between items-start">
                <p className="text-lg font-semibold text-gray-700">{prompt}</p>
                <span className={`font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                  {points} {q.type === 'sentence' ? 'pts' : 'pt'}
                </span>
              </div>
              <p className="mt-2">Your answer: <span className="font-mono p-1 bg-gray-200 rounded text-gray-800">{q.answer || 'No answer'}</span></p>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => rescoreQuestion(i, q)}
                  disabled={rescoring.has(i)}
                  className={`inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${rescoring.has(i) ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  {rescoring.has(i) ? 'Rescoring...' : 'Rescore'}
                </button>
                {!isAdminView && (
                  <>
                    <button
                      onClick={() => handleToggleBookmarkQuestion(i, q)}
                      disabled={pendingQuestionIdx.has(i)}
                      className={`inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${pendingQuestionIdx.has(i) ? 'bg-gray-400 cursor-not-allowed' : (savedQuestionIdx.has(i) ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-600 hover:bg-amber-700')}`}
                    >
                      {pendingQuestionIdx.has(i) ? 'Working...' : (savedQuestionIdx.has(i) ? 'Unbookmark' : 'Bookmark')}
                    </button>
                    {q.word && (
                      <button
                        onClick={() => handleToggleVocab(q)}
                        disabled={pendingVocabWords.has(q.word)}
                        className={`inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${pendingVocabWords.has(q.word) ? 'bg-gray-400 cursor-not-allowed' : (savedVocabWords.has(q.word) ? 'bg-fuchsia-600 hover:bg-fuchsia-700' : 'bg-emerald-600 hover:bg-emerald-700')}`}
                      >
                        {pendingVocabWords.has(q.word) ? 'Working...' : (savedVocabWords.has(q.word) ? 'Unsave Vocab' : 'Save Vocab')}
                      </button>
                    )}
                  </>
                )}
              </div>

              {q.feedback && (
                <div className="mt-2 text-sm text-blue-700 p-2 bg-blue-100 rounded">
                  <strong>AI Feedback:</strong> {q.feedback}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
