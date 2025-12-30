import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QuizStepper from '../components/quiz/QuizStepper';
import Section1_Definitions from '../components/quiz/Section1_Definitions';
import Section2_FillInTheBlank from '../components/quiz/Section2_FillInTheBlank';
import Section3_SentenceCreation from '../components/quiz/Section3_SentenceCreation';
import { parseAndCategorizeQuizData } from '../lib/quizParser';

const API = '/api';

const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

const pLimit = (concurrency) => {
  const queue = [];
  let active = 0;
  const next = () => { active--; if (queue.length) queue.shift()(); };
  const run = async (fn, resolve) => { active++; const result = fn(); resolve(result); try { await result; } finally { next(); } };
  return (fn) => new Promise((resolve) => { queue.push(() => run(fn, resolve)); if (active < concurrency && queue.length) queue.shift()(); });
};

const LoadingOverlay = ({ isScoring, isSubmitting, progress }) => (
  <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center">
    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-white mb-4"></div>
    {isScoring && (
      <>
        <p className="text-white text-lg font-semibold">Scoring your sentences with AI...</p>
        <p className="text-white text-md mt-2">Please wait, this may take a moment.</p>
        <div className="w-3/4 max-w-md mt-4 bg-gray-600 rounded-full h-4">
          <div className="bg-green-500 h-4 rounded-full transition-all duration-500 ease-out" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
        </div>
        <p className="text-white text-sm mt-2">{progress.current} / {progress.total} sentences scored</p>
      </>
    )}
    {isSubmitting && !isScoring && (<p className="text-white text-lg font-semibold">Finalizing and saving your results...</p>)}
  </div>
);

export default function TakeQuizPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quizName, setQuizName] = useState('');
  const [quizData, setQuizData] = useState(null);
  const [shuffledFillInBlanks, setShuffledFillInBlanks] = useState([]);
  const [answers, setAnswers] = useState({ section2: [], section3: [] });
  const [currentSection, setCurrentSection] = useState(1);
  const [sectionStatus, setSectionStatus] = useState(['untouched', 'untouched', 'untouched']);
  const [isLoading, setIsLoading] = useState(true);
  const [isScoring, setIsScoring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoringProgress, setScoringProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [finalScore, setFinalScore] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true); setError(null);
      try {
        const r = await fetch(`${API}/quizzes/${quizId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        if (!r.ok) throw new Error('Failed to load quiz');
        const data = await r.json();
        setQuizName(data.name || '');
        const items = data?.data?.items || data?.data || [];
        const categorized = parseAndCategorizeQuizData(items);
        setQuizData(categorized);
        const shuffled = shuffleArray(categorized.fillInTheBlanks);
        setShuffledFillInBlanks(shuffled);
        setAnswers({ section2: new Array(shuffled.length).fill(''), section3: new Array(categorized.sentences.length).fill('') });
      } catch (e) { setError(e.message || 'Load failed'); }
      finally { setIsLoading(false); }
    };
    if (quizId) load();
  }, [quizId]);

  const handleAnswerChange = (section, index, value) => {
    setAnswers(prev => {
      const n = { ...prev, [section]: prev[section].map((v, i) => (i === index ? value : v)) };
      const sectionIndex = section === 'section2' ? 1 : 2;
      const target = n[section];
      const total = section === 'section2' ? (quizData?.fillInTheBlanks.length || 0) : (quizData?.sentences.length || 0);
      if (total > 0) {
        const answered = target.filter(a => (a || '').trim() !== '').length;
        let status = 'untouched';
        if (answered === total) status = 'completed'; else if (answered > 0) status = 'attempted';
        setSectionStatus(prevS => { const ns = [...prevS]; ns[sectionIndex] = status; return ns; });
      }
      return n;
    });
  };

  const handleSubmit = async () => {
    if (!quizData || isScoring || isSubmitting) return;
    setIsScoring(true);
    const fillQ = shuffledFillInBlanks.map((q, i) => ({ ...q, answer: answers.section2[i] || '' }));
    const sentQ = quizData.sentences.map((q, i) => ({ ...q, answer: answers.section3[i] || '' }));
    const questionsToScore = [...fillQ.filter(q => q.answer.trim() !== ''), ...sentQ.filter(q => q.answer.trim() !== '')];
    setScoringProgress({ current: 0, total: questionsToScore.length });
    const limit = pLimit(5);

    const fetchScoreWithRetry = async (endpoint, payload, q) => {
      const attempt = async () => {
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const text = await res.text();
        if (res.ok) { try { return JSON.parse(text); } catch { throw new Error('RETRY'); } }
        try { const errObj = JSON.parse(text); if (String(errObj?.error || '').includes('internal scoring error')) throw new Error('RETRY'); } catch {}
        throw new Error('RETRY');
      };
      try { return await attempt(); } catch { await new Promise(r => setTimeout(r, 300)); try { return await attempt(); } catch { return q.type === 'fill-in-the-blank' ? { correct: false, feedback: 'Scoring failed.' } : { score: 0, feedback: 'Scoring failed.' }; } }
    };

    const scoringPromises = questionsToScore.map(q => limit(async () => {
      const endpoint = q.type === 'fill-in-the-blank' ? `${API}/ai/fill-in-blank-score` : `${API}/ai/sentence-score`;
      const payload = q.type === 'fill-in-the-blank' ? { prompt: q.prompt, answer: q.answer, word: q.word } : { word: q.word, sentence: q.answer, definition: q.definition };
      const data = await fetchScoreWithRetry(endpoint, payload, q);
      setScoringProgress(prev => ({ ...prev, current: prev.current + 1 }));
      return { ...q, ...data };
    }));

    const scoredResults = await Promise.all(scoringPromises);
    const scoredMap = new Map(scoredResults.map(r => [r.id, r]));

    const finalSection2Details = fillQ.map(q => {
      const s = scoredMap.get(q.id);
      return { id: q.id, answer: q.answer, prompt: q.prompt, type: q.type, word: q.word, correct: s ? !!s.correct : false, feedback: s ? s.feedback : (q.answer.trim() === '' ? 'No answer provided. 😢' : 'Scoring failed.') };
    });
    const finalSection3Details = sentQ.map(q => {
      const s = scoredMap.get(q.id);
      return { id: q.id, answer: q.answer, type: q.type, word: q.word, score: s ? (s.score || 0) : 0, feedback: s ? s.feedback : (q.answer.trim() === '' ? 'No answer provided.' : 'Scoring failed.') };
    });

    setIsScoring(false); setIsSubmitting(true);
    const finalPayload = { username: '', quiz_id: quizId, time_spent: 0, details: { name: quizName, questions: [...finalSection2Details, ...finalSection3Details] } };
    try {
      const r = await fetch(`${API}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(finalPayload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Submit failed');
      setFinalScore({ score: j.score || 0, total: j.total_score || (finalSection2Details.length + finalSection3Details.length*3) });
      navigate(`/quiz-results?id=${j.id}`);
    } catch (e) {
      alert(e.message || 'Submit failed');
      setIsSubmitting(false);
    }
  };

  const wordBank = useMemo(() => quizData ? shuffleArray(quizData.fillInTheBlanks.map(q => q.word)) : [], [quizData]);

  if (isLoading) return <p className="p-6 text-center">Loading Quiz...</p>;
  if (error) return <p className="p-6 text-center text-red-500">Error: {error}</p>;
  if (!quizData) return <p className="p-6 text-center">No quiz data found.</p>;

  const sectionTitles = ['Review', 'Fill Blanks', 'Create Sentences'];
  const totalSections = sectionTitles.length;

  return (
    <>
      {(isScoring || isSubmitting) && <LoadingOverlay isScoring={isScoring} isSubmitting={isSubmitting} progress={scoringProgress} />}
      <main className="p-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">{quizName}</h1>
        <QuizStepper currentSection={currentSection} setSection={setCurrentSection} sectionTitles={sectionTitles} sectionStatus={sectionStatus} />
        <div className="mt-6">
          {currentSection === 1 && <Section1_Definitions questions={quizData.definitions} />}
          {currentSection === 2 && <Section2_FillInTheBlank questions={shuffledFillInBlanks} wordBank={wordBank} answers={answers.section2} onAnswerChange={(i, v) => handleAnswerChange('section2', i, v)} isReview={false} />}
          {currentSection === 3 && <Section3_SentenceCreation questions={quizData.sentences} answers={answers.section3} onAnswerChange={(i, v) => handleAnswerChange('section3', i, v)} isReview={false} />}
        </div>
        <div className="flex justify-between mt-8">
          <button onClick={() => setCurrentSection(s => Math.max(1, s - 1))} disabled={currentSection === 1} className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
          {currentSection < totalSections ? (
            <button onClick={() => setCurrentSection(s => Math.min(totalSections, s + 1))} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Next</button>
          ) : (
            <button onClick={handleSubmit} disabled={isSubmitting || isScoring} className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400">{isScoring ? `Scoring... (${scoringProgress.current}/${scoringProgress.total})` : (isSubmitting ? 'Submitting...' : 'Submit Quiz')}</button>
          )}
        </div>
      </main>
    </>
  );
}

