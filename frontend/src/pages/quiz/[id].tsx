"use client"
import { useContext, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import AuthContext from '../../contexts/AuthContext'
import { parseAndCategorizeQuizData, ParsedQuizData, Question } from '../../lib/quizParser'
import withAuth from '../../components/withAuth'

import QuizStepper from '../../components/quiz/QuizStepper'
import Section1_Definitions from '../../components/quiz/Section1_Definitions'
import Section2_FillInTheBlank from '../../components/quiz/Section2_FillInTheBlank'
import Section3_SentenceCreation from '../../components/quiz/Section3_SentenceCreation'

const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

// Helper for running promises with a concurrency limit.
// It's defined outside the component to avoid re-creation on renders.
const pLimit = (concurrency: number) => {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()?.();
    }
  };

  const run = async <T,>(fn: () => Promise<T>, resolve: (value: T | PromiseLike<T>) => void) => {
    activeCount++;
    const result = fn();
    resolve(result);
    try {
      await result;
    } catch {
      // Errors are handled by the caller, just ensure `next` is called.
    }
    next();
  };

  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>(resolve => {
      queue.push(() => run(fn, resolve));
      if (activeCount < concurrency && queue.length > 0) {
        queue.shift()?.();
      }
    });

  return enqueue;
};

// --- Loading Overlay Component ---
const LoadingOverlay = ({ isScoring, isSubmitting, progress }: { isScoring: boolean, isSubmitting: boolean, progress: { current: number, total: number } }) => (
  <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex flex-col items-center justify-center transition-opacity duration-300">
    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-white mb-4"></div>
    {isScoring && (
      <>
        <p className="text-white text-lg font-semibold">Scoring your sentences with AI...</p>
        <p className="text-white text-md mt-2">Please wait, this may take a moment.</p>
        <div className="w-3/4 max-w-md mt-4 bg-gray-600 rounded-full h-4">
          <div 
            className="bg-green-500 h-4 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          ></div>
        </div>
        <p className="text-white text-sm mt-2">{progress.current} / {progress.total} sentences scored</p>
      </>
    )}
    {isSubmitting && !isScoring && (
      <p className="text-white text-lg font-semibold">Finalizing and saving your results...</p>
    )}
  </div>
);


function QuizPage() {
  const router = useRouter()
  const { user } = useContext(AuthContext)
  const { id, result_id } = router.query;

  const [quizName, setQuizName] = useState('');
  const [quizData, setQuizData] = useState<ParsedQuizData | null>(null);
  const [shuffledFillInBlanks, setShuffledFillInBlanks] = useState<Question[]>([]);
  
  const [answers, setAnswers] = useState<{ section2: string[], section3: string[] }>({ section2: [], section3: [] });
  const [scoredSentences, setScoredSentences] = useState<any[]>([]);
  const [currentSection, setCurrentSection] = useState(1);
  const [sectionStatus, setSectionStatus] = useState<string[]>(['untouched', 'untouched', 'untouched']);

  const [isLoading, setIsLoading] = useState(true);
  const [isScoring, setIsScoring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoringProgress, setScoringProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewDetails, setReviewDetails] = useState<any>(null);
  const [finalScore, setFinalScore] = useState<{ score: number, total: number } | null>(null);


  useEffect(() => {
    const fetchQuizForTaking = (quizId: string) => {
      fetch(`/api/quizzes/${quizId}`)
        .then(res => {
          if (!res.ok) throw new Error(`Failed to load the quiz (status: ${res.status}).`);
          return res.json();
        })
        .then(data => {
          setQuizName(data.name);
          const items = data.data?.items || data.data || [];
          const categorizedData = parseAndCategorizeQuizData(items);
          setQuizData(categorizedData);
          
          const shuffled = shuffleArray(categorizedData.fillInTheBlanks);
          setShuffledFillInBlanks(shuffled);

          setAnswers({
            section2: new Array(shuffled.length).fill(''),
            section3: new Array(categorizedData.sentences.length).fill(''),
          });
          setScoredSentences(new Array(categorizedData.sentences.length).fill(null));
        })
        .catch(err => setError((err as Error).message))
        .finally(() => setIsLoading(false));
    };

    const fetchResultsForReview = (resultId: string) => {
      fetch(`/api/results/${resultId}`)
        .then(res => {
          if (!res.ok) throw new Error(`Failed to load review data (status: ${res.status}).`);
          return res.json();
        })
        .then(data => {
          const details = data.details;
          setReviewDetails(details);
          setQuizName(details.name);
          
          setFinalScore({ score: data.score, total: data.total_score });

          const section2Questions = details.questions.filter((q: any) => q.hasOwnProperty('correctAnswer'));
          const section3Questions = details.questions.filter((q: any) => !q.hasOwnProperty('correctAnswer'));
          
          const categorizedData = {
              definitions: details.questions.map((q:any) => ({word: q.word, definition: q.definition})),
              fillInTheBlanks: section2Questions,
              sentences: section3Questions,
          };

          setQuizData(categorizedData as any);
          setShuffledFillInBlanks(section2Questions);

          setAnswers({
            section2: section2Questions.map((q: any) => q.answer || ''),
            section3: section3Questions.map((q: any) => q.answer || ''),
          });
          setIsReviewMode(true);
        })
        .catch(err => setError((err as Error).message))
        .finally(() => setIsLoading(false));
    };

    setIsLoading(true);
    setError(null);

    if (result_id) {
      fetchResultsForReview(result_id as string);
    } else if (id) {
      fetchQuizForTaking(id as string);
    }
  }, [id, result_id]);

  const handleAnswerChange = (section: 'section2' | 'section3', index: number, value: string) => {
    if (isReviewMode) return;

    // Use a callback with setAnswers to ensure we have the latest state
    setAnswers(prevAnswers => {
      const newAnswers = {
        ...prevAnswers,
        [section]: prevAnswers[section].map((ans, i) => (i === index ? value : ans)),
      };

      // Now, calculate the new status based on the truly updated answers
      const sectionIndex = section === 'section2' ? 1 : 2;
      const targetAnswers = newAnswers[section];
      const totalQuestions = section === 'section2' 
        ? (quizData?.fillInTheBlanks.length || 0)
        : (quizData?.sentences.length || 0);

      if (totalQuestions > 0) {
        const answeredCount = targetAnswers.filter(ans => ans.trim() !== '').length;
        
        let newStatus = 'untouched';
        if (answeredCount === totalQuestions) {
          newStatus = 'completed';
        } else if (answeredCount > 0) {
          newStatus = 'attempted';
        }
        
        // Update sectionStatus if it has changed
        setSectionStatus(prevStatus => {
          if (prevStatus[sectionIndex] !== newStatus) {
            const newStatuses = [...prevStatus];
            newStatuses[sectionIndex] = newStatus;
            return newStatuses;
          }
          return prevStatus;
        });
      }
      
      return newAnswers;
    });
  };

  const handleSubmit = async () => {
    if (!user || !quizData || isSubmitting || isScoring || isReviewMode) return;

    setIsScoring(true);

    // --- Questions to be scored by AI ---
    const fillInTheBlankQuestions = shuffledFillInBlanks.map((q, i) => ({
      ...q,
      answer: answers.section2[i] || '',
    }));

    const sentenceQuestions = quizData.sentences.map((q, i) => ({
      ...q,
      answer: answers.section3[i] || '',
    }));

    const questionsToScore = [
      ...fillInTheBlankQuestions.filter(q => q.answer.trim() !== ''),
      ...sentenceQuestions.filter(q => q.answer.trim() !== '')
    ];
    
    setScoringProgress({ current: 0, total: questionsToScore.length });

    const limit = pLimit(5); // Concurrency limit of 5

    // Helper: score with one retry on internal error or bad JSON
    const fetchScoreWithRetry = async (endpoint: string, payload: any, q: any) => {
      const attempt = async () => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        if (res.ok) {
          try { return JSON.parse(text); } catch { throw new Error('RETRY'); }
        }
        try {
          const errObj = JSON.parse(text);
          if (typeof errObj?.error === 'string' && errObj.error.includes('internal scoring error')) {
            throw new Error('RETRY');
          }
        } catch { /* ignore non-JSON body */ }
        throw new Error('RETRY');
      };
      try {
        return await attempt();
      } catch {
        await new Promise(r => setTimeout(r, 300));
        try { return await attempt(); } catch {
          return q.type === 'fill-in-the-blank'
            ? { correct: false, feedback: 'Scoring failed.' }
            : { score: 0, feedback: 'Scoring failed.' };
        }
      }
    };

    // --- Scoring Promises ---
    const scoringPromises = questionsToScore.map(q => limit(async () => {
      const endpoint = q.type === 'fill-in-the-blank' ? '/api/ai/fill-in-blank-score' : '/api/ai/sentence-score';
      const payload = q.type === 'fill-in-the-blank'
        ? { prompt: q.prompt, answer: q.answer, word: q.word }
        : { word: q.word, sentence: q.answer, definition: q.definition };
      const scoreData = await fetchScoreWithRetry(endpoint, payload, q);
      setScoringProgress(prev => ({ ...prev, current: prev.current + 1 }));
      return { ...q, ...scoreData };
    }));

    const scoredResults = await Promise.all(scoringPromises);

    // --- Segregate back into sections ---
    const scoredMap = new Map(scoredResults.map(r => [r.id, r]));
    
    const finalSection2Details = fillInTheBlankQuestions.map(q => {
      const scored = scoredMap.get(q.id);
      return { 
        id: q.id, 
        answer: q.answer, 
        prompt: q.prompt, 
        type: q.type,
        word: q.word,
        correct: scored ? scored.correct : false, // Mark unscored (empty) as incorrect
        feedback: scored ? scored.feedback : (q.answer.trim() === '' ? 'No answer provided. 😢' : 'Scoring failed.')
      };
    });

    const finalSection3Details = sentenceQuestions.map(q => {
      const scored = scoredMap.get(q.id);
      return { 
        id: q.id, 
        answer: q.answer, 
        type: q.type,
        word: q.word,
        score: scored ? scored.score : 0, 
        feedback: scored ? scored.feedback : (q.answer.trim() === '' ? 'No answer provided.' : 'Scoring failed.')
      };
    });

    setIsScoring(false);
    setIsSubmitting(true);

    // --- Final Payload Construction ---
    const finalPayload = {
      username: user.username,
      quiz_id: id,
      time_spent: 0, // Placeholder
      details: {
        name: quizName,
        questions: [...finalSection2Details, ...finalSection3Details],
      },
    };

    try {
      const r = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload),
      });
      if (!r.ok) {
        const errData = await r.json();
        throw new Error(errData.error || 'Failed to submit final results.');
      }
      const res = await r.json();
      router.push(`/quiz-results?id=${res.id}`);
    } catch (err) {
      alert(`Submission failed: ${(err as Error).message}`);
      setIsSubmitting(false);
    }
  };

  const handleSectionChange = (newSection: number) => {
    const oldSectionIndex = currentSection - 1;
    
    // Special handling for Section 1: mark as completed when leaving.
    if (currentSection === 1 && sectionStatus[oldSectionIndex] !== 'completed') {
      setSectionStatus(prevStatus => {
        const newStatuses = [...prevStatus];
        newStatuses[oldSectionIndex] = 'completed';
        return newStatuses;
      });
    }
    
    setCurrentSection(newSection);
  };

  const wordBank = useMemo(() => {
    if (!quizData) return [];
    return shuffleArray(quizData.fillInTheBlanks.map(q => q.word));
  }, [quizData]);

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
        
        {isReviewMode && finalScore && (
          <div className="my-4 p-4 bg-blue-100 rounded-lg text-center">
            <h2 className="text-xl font-semibold">Final Score</h2>
            <p className="text-4xl font-bold text-blue-600">{finalScore.score} / {finalScore.total}</p>
          </div>
        )}

        <QuizStepper currentSection={currentSection} setSection={handleSectionChange} sectionTitles={sectionTitles} sectionStatus={sectionStatus} />
        
        <div className="mt-6">
          {currentSection === 1 && <Section1_Definitions questions={quizData.definitions} />}
          {currentSection === 2 && <Section2_FillInTheBlank questions={shuffledFillInBlanks} wordBank={wordBank} answers={answers.section2} onAnswerChange={(i, v) => handleAnswerChange('section2', i, v)} isReview={isReviewMode} />}
          {currentSection === 3 && <Section3_SentenceCreation questions={quizData.sentences} answers={answers.section3} onAnswerChange={(i, v) => handleAnswerChange('section3', i, v)} isReview={isReviewMode} />}
        </div>

        <div className="flex justify-between mt-8">
          <button
            onClick={() => handleSectionChange(currentSection - 1)}
            disabled={currentSection === 1}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {currentSection < totalSections ? (
            <button
              onClick={() => handleSectionChange(currentSection + 1)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Next
            </button>
          ) : (
            !isReviewMode ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isScoring}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
              >
                {isScoring ? `Scoring... (${scoringProgress.current}/${scoringProgress.total})` : (isSubmitting ? 'Submitting...' : 'Submit Quiz')}
              </button>
            ) : (
              <button
                onClick={() => router.push('/my-progress')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Back to Progress
              </button>
            )
          )}
        </div>
      </main>
    </>
  );
}

export default withAuth(QuizPage)
