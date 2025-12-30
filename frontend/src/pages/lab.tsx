import React, { useState, FC, useEffect, useMemo, useContext } from 'react';
import { useRouter } from 'next/router';
import { BeakerIcon } from '@heroicons/react/24/outline';
import AuthContext from '../contexts/AuthContext';

// --- Utility Functions ---
const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

const encouragingMessages = [
  "Don't worry, every mistake is a step forward.",
  "That was a tricky one! You'll get it next time.",
  "Persistence is key. Keep going!",
  "Learning is a journey. This is just one step.",
  "Great effort! The right answer is just a lesson away."
];

const getRandomEncouragement = () => encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];

// --- Interfaces ---
interface Definition {
  pos: string;
  cn: string;
  en: string;
}

interface QuizItem {
  word: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  definition?: Definition;
  stage1?: { // See-sentence-choose-definition
    sentence: string;
  };
  stage3?: { // Unscramble sentence
    correct_sentence: string;
    scrambled_sentence: string[];
  };
  stage4?: { // Reverse quiz
    sentence: string;
    answer: string;
  };
  error?: string;
}

interface LearningQuestion {
  word: string;
  stage: number;
  item: QuizItem;
  options?: string[]; // For stages 1, 2, 4
}

interface WordProgress {
  stage: number; // 1: See-sentence-choose-def, 2: See-word-choose-def, 3: Unscramble, 4: Reverse, 5: Mastered
  status: 'unseen' | 'learning' | 'mastered';
  last_result: 'correct' | 'incorrect' | null;
}

// --- Hint Modal Component ---
interface HintModalProps {
  words: string[];
  hints: Record<string, string>;
  setHints: (hints: Record<string, string>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const HintModal: FC<HintModalProps> = ({ words, hints, setHints, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 space-y-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Add Hints for Disambiguation (Optional)</h2>
            <p className="text-sm text-gray-600 mt-1">
              For words with multiple meanings, provide a hint to guide the AI (e.g., for 'bank', you could enter 'river' or 'finance').
            </p>
          </div>
        </div>
        <div className="overflow-y-auto space-y-4 pr-2 flex-grow">
          {words.map(word => (
            <div key={word} className="p-3 border rounded-md bg-gray-50 space-y-2">
              <label className="font-bold text-lg text-gray-800">{word}</label>
              <input
                className="border p-2 rounded w-full"
                value={hints[word] || ''}
                onChange={e => setHints({ ...hints, [word]: e.target.value })}
                placeholder="Provide a context hint (e.g., music, lock, river, finance)"
              />
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

// --- API Fetcher Functions ---
const fetchVocabularyContent = async (words: string[], username: string): Promise<QuizItem[]> => {
  const res = await fetch('/api/bookmarks/vocabulary/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words, username }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || `Failed to fetch vocabulary content`);
  }
  const bookmarks = await res.json();
  // The backend now returns the full QuizItem structure, but we need to ensure it matches the frontend interface
  return bookmarks.map((bm: any) => ({
    word: bm.word,
    status: 'done', // Mark as done since content is pre-generated
    definition: bm.definition,
    stage1: bm.stage1,
    stage3: {
        correct_sentence: bm.stage3.sentence,
        scrambled_sentence: bm.stage3.sentence.split(' ').sort(() => Math.random() - 0.5)
    },
    stage4: bm.stage4,
  }));
};

// --- Sentence Highlight Component ---
const HighlightedSentence: FC<{ sentence: string }> = ({ sentence }) => {
    const parts = sentence.split(/(_[^_]+_)/g);
    return (
        <p className="text-lg mb-4 leading-relaxed">
            {parts.map((part, i) => {
                if (part.startsWith('_') && part.endsWith('_')) {
                    return <strong key={i} className="font-bold text-blue-600 px-2 py-1 bg-blue-100 rounded-md">{part.slice(1, -1)}</strong>;
                }
                return part;
            })}
        </p>
    );
};

// --- Scramble Puzzle Component ---
const ScramblePuzzle: FC<{ scrambled: string[]; onSubmit: (answer:string) => void }> = ({ scrambled, onSubmit }) => {
    const initialWords = useMemo(() => scrambled.map((word, index) => ({ word, id: index })), [scrambled]);

    const [selected, setSelected] = useState<{ word: string; id: number }[]>([]);
    const [options, setOptions] = useState<{ word: string; id: number }[]>(initialWords);

    useEffect(() => {
        const newInitialWords = scrambled.map((word, index) => ({ word, id: index }));
        setOptions(newInitialWords);
        setSelected([]);
    }, [scrambled]);


    const handleSelectWord = (word: { word: string; id: number }) => {
        setSelected([...selected, word]);
        setOptions(options.filter(o => o.id !== word.id));
    };

    const handleDeselectWord = (word: { word: string; id: number }) => {
        setSelected(selected.filter(s => s.id !== word.id));
        setOptions([...options, word].sort((a, b) => a.id - b.id));
    };

    const handleSubmitClick = () => {
        onSubmit(selected.map(s => s.word).join(' '));
    };

    return (
        <div>
            <div className="p-4 border-b-2 border-gray-300 mb-4 min-h-[60px] flex flex-wrap gap-2 items-center bg-gray-50 rounded-t-md">
                {selected.length === 0 && <span className="text-gray-400">Build the sentence here...</span>}
                {selected.map((word) => (
                    <button
                        key={word.id}
                        onClick={() => handleDeselectWord(word)}
                        className="px-3 py-2 bg-white border-2 border-gray-300 rounded-md text-lg font-medium shadow-sm animate-fade-in"
                    >
                        {word.word}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap justify-center gap-3 my-4 min-h-[60px]">
                {options.map((word) => (
                    <button
                        key={word.id}
                        onClick={() => handleSelectWord(word)}
                        className="px-3 py-2 bg-white border-2 border-blue-400 rounded-md text-lg font-medium hover:bg-blue-100 transition-all transform hover:scale-105"
                    >
                        {word.word}
                    </button>
                ))}
            </div>

            <button
                onClick={handleSubmitClick}
                disabled={selected.length === 0}
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-md font-semibold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                Check
            </button>
        </div>
    );
};

// --- Question View Component ---
const QuestionView: FC<{ question: LearningQuestion; onSubmit: (answer: string) => void }> = ({ question, onSubmit }) => {

  const getQuestionTitle = () => {
    switch (question.stage) {
      case 1:
        return 'Meaning in Context';
      case 2:
        return 'Definition Quiz';
      case 3:
        return `Unscramble: ${question.word}`;
      case 4:
        return "What's the word?";
      default:
        return 'Quiz';
    }
  };

  const renderQuestionContent = () => {
    switch (question.stage) {
      case 1: // See sentence, choose definition
        const stage1Sentence = question.item.stage1?.sentence;
        return (
          <div>
            <p className="text-lg mb-4">What does the highlighted word mean in this sentence?</p>
            <div className="p-4 border rounded-md bg-gray-100 mb-4">
                {stage1Sentence && <HighlightedSentence sentence={stage1Sentence} />}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {question.options?.map((option, index) => (
                <button
                  key={index}
                  onClick={() => onSubmit(option)}
                  className="p-3 bg-white border-2 border-gray-300 rounded-md text-left hover:bg-blue-100 hover:border-blue-400 transition-all h-full"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      case 2: // See word, choose definition
        return (
          <div>
            <p className="text-lg mb-4">Which of the following defines <span className="font-bold">{question.word}</span>?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {question.options?.map((option, index) => (
                <button
                  key={index}
                  onClick={() => onSubmit(option)}
                  className="p-3 bg-white border-2 border-gray-300 rounded-md text-left hover:bg-blue-100 hover:border-blue-400 transition-all h-full"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      case 3: // Unscramble sentence
        return (
          <div>
            <p className="text-lg mb-2">Unscramble the sentence:</p>
            {question.item.stage3?.scrambled_sentence && (
              <ScramblePuzzle 
                scrambled={question.item.stage3.scrambled_sentence} 
                onSubmit={onSubmit} 
              />
            )}
          </div>
        );
      case 4: // Reverse quiz
        const sentence = question.item.stage4?.sentence;
        const definition = `Which word fits the definition: "${question.item.definition?.en}"?`;
        return (
          <div>
            {sentence ? (
              <HighlightedSentence sentence={sentence} />
            ) : (
              <p className="text-lg mb-4">{definition}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {question.options?.map((option, index) => (
                <button
                  key={index}
                  onClick={() => onSubmit(option)}
                  className="p-3 bg-white border-2 border-gray-300 rounded-md text-center hover:bg-blue-100 hover:border-blue-400 transition-all h-full font-semibold"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return <p>Invalid question stage.</p>;
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h4 className="font-bold text-2xl mb-4 text-center">{getQuestionTitle()}</h4>
      {renderQuestionContent()}
    </div>
  );
};

// --- Feedback Modal Component ---
interface FeedbackModalProps {
  result: {
    correct: boolean;
    correctAnswer?: string;
    definition?: Definition;
  };
  onClose: () => void;
}

const FeedbackModal: FC<FeedbackModalProps> = ({ result, onClose }) => {
  if (result.correct) {
    return (
      <div className="mt-4 p-3 rounded-md text-white font-bold bg-green-500">
        Correct!
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 space-y-5 w-full max-w-md m-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-600">{getRandomEncouragement()}</p>
          <h3 className="text-2xl font-bold mt-2">The correct answer is: <span className="text-blue-600">{result.correctAnswer}</span></h3>
        </div>
        {result.definition && (
          <div className="p-4 border rounded-md bg-gray-50 text-left">
            <p className="font-bold text-gray-800">
              <span className="text-sm bg-blue-100 text-blue-800 font-semibold px-2 py-1 rounded-full mr-2">{result.definition.pos}</span>
              {result.definition.en}
            </p>
            <p className="text-gray-600 mt-1">{result.definition.cn}</p>
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full bg-blue-600 text-white px-6 py-3 rounded-md font-semibold text-lg hover:bg-blue-700 transition-transform transform hover:scale-105"
        >
          Got it!
        </button>
      </div>
    </div>
  );
};

// --- Quiz Session Component ---
const QuizSession: FC<{
  items: QuizItem[];
  initialProgress: Record<string, WordProgress>;
  onSessionEnd: () => void;
  mode?: string; // 'review' or undefined
}> = ({ items, initialProgress, onSessionEnd, mode }) => {
  const [wordProgress, setWordProgress] = useState(initialProgress);
  const [currentRound, setCurrentRound] = useState<LearningQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lastAnswerResult, setLastAnswerResult] = useState<{ correct: boolean; correctAnswer?: string; definition?: Definition } | null>(null);
  const { user } = useContext(AuthContext);
  
  const itemsByWord = useMemo(() => items.reduce((acc, item) => {
    acc[item.word] = item;
    return acc;
  }, {} as Record<string, QuizItem>), [items]);

  const markWordAsLearned = async (word: string) => {
    if (!user) return;
    try {
      await fetch('/api/bookmarks/vocabulary/mark-learned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, word }),
      });
    } catch (error) {
      console.error(`Failed to mark word ${word} as learned:`, error);
      // Optionally, handle this error, e.g., by showing a notification
    }
  };

  const recordReviewOutcome = async (word: string, is_correct: boolean) => {
    if (!user) return;
    try {
      await fetch('/api/bookmarks/vocabulary/record-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, word, is_correct }),
      });
    } catch (error) {
      console.error(`Failed to record review outcome for ${word}:`, error);
    }
  };

  const buildNextRound = (currentProgress: Record<string, WordProgress>) => {
    const learningWords = Object.keys(currentProgress).filter(word => currentProgress[word].status === 'learning');
    
    if (learningWords.length === 0) {
        alert("Congratulations! You've mastered all the words!");
        onSessionEnd();
        return;
    }

    const incorrectWords = learningWords.filter(word => currentProgress[word].last_result === 'incorrect');
    const correctWords = learningWords.filter(word => currentProgress[word].last_result === 'correct');
    
    let roundWords: string[] = [...incorrectWords];
    
    for (const word of correctWords) {
      if (roundWords.length < 8) roundWords.push(word);
    }
    
    if (roundWords.length === 0 && learningWords.length > 0) {
        roundWords = learningWords.slice(0, 8);
    }

    const nextRound: LearningQuestion[] = roundWords.map(word => {
      const progress = currentProgress[word];
      const item = itemsByWord[word];
      const question: LearningQuestion = { word, stage: progress.stage, item };
      const allWords = items.map(i => i.word);

      // Options for definition quizzes (Stage 1 and 2)
      if (progress.stage === 1 || progress.stage === 2) {
        const correctAnswer = item.definition!.en;
        const distractors = shuffleArray(items.filter(i => i.word !== word).map(i => i.definition!.en)).slice(0, 3);
        question.options = shuffleArray([correctAnswer, ...distractors]);
      } 
      // Options for reverse quiz (Stage 4)
      else if (progress.stage === 4) {
        const correctAnswer = item.word;
        const distractors = shuffleArray(allWords.filter(w => w !== correctAnswer)).slice(0, 6);
        question.options = shuffleArray([correctAnswer, ...distractors]);
      }
      return question;
    });

    setCurrentRound(shuffleArray(nextRound));
    setQuestionIndex(0);
  };

  // Initial round starts with Stage 1 for all words
  useEffect(() => {
    buildNextRound(initialProgress);
  }, []);

  const proceedToNextStep = () => {
    setLastAnswerResult(null);
    if (questionIndex < currentRound.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      buildNextRound(wordProgress);
    }
  };

  const handleAnswerSubmit = (answer: string) => {
    const currentQuestion = currentRound[questionIndex];
    if (!currentQuestion) return;

    let isCorrect = false;
    let correctAnswerText = '';
    switch (currentQuestion.stage) {
      case 1: // See sentence, choose definition
      case 2: // See word, choose definition
        isCorrect = answer === currentQuestion.item.definition!.en;
        correctAnswerText = currentQuestion.item.definition!.en;
        break;
      case 3: // Unscramble sentence
        const cleanUserAnswer = answer.replace(/[.,\/#!$%^&*\*;:{}=\-_`~()]/g,"").toLowerCase();
        const cleanCorrectAnswer = currentQuestion.item.stage3!.correct_sentence.replace(/[.,\/#!$%^&*\*;:{}=\-_`~()]/g,"").toLowerCase();
        isCorrect = cleanUserAnswer === cleanCorrectAnswer;
        correctAnswerText = currentQuestion.item.stage3!.correct_sentence;
        break;
      case 4: // Reverse quiz
        isCorrect = answer.toLowerCase() === currentQuestion.word.toLowerCase();
        correctAnswerText = currentQuestion.word;
        break;
    }

    const updatedProgress = { ...wordProgress };
    const currentWordProgress = updatedProgress[currentQuestion.word];

    if (mode === 'review') {
        // In review mode, we just record the outcome and don't change the stage here.
        // The backend handles the stage progression.
        recordReviewOutcome(currentQuestion.word, isCorrect);
        // For immediate UI feedback, we can mark it as mastered for this session if correct
        if(isCorrect) {
            updatedProgress[currentQuestion.word] = { ...currentWordProgress, status: 'mastered' };
        } else {
            // If incorrect in review, keep it in the learning pool for this session
             updatedProgress[currentQuestion.word] = { ...currentWordProgress, last_result: 'incorrect' };
        }
    } else {
        // Standard learning mode
        if (isCorrect) {
          const nextStage = currentWordProgress.stage + 1;
          const isMastered = nextStage >= 5;
          updatedProgress[currentQuestion.word] = {
            ...currentWordProgress,
            stage: nextStage,
            last_result: 'correct',
            status: isMastered ? 'mastered' : 'learning',
          };
          if (isMastered) {
            // This is the first time mastering, so initialize the SRS schedule
            markWordAsLearned(currentQuestion.word);
          }
        } else {
          // Punishment: If incorrect, reset the word to Stage 1.
          updatedProgress[currentQuestion.word] = { 
            ...currentWordProgress, 
            stage: 1, 
            last_result: 'incorrect',
            status: 'learning'
          };
        }
    }

    setWordProgress(updatedProgress);
    
    setLastAnswerResult({ 
      correct: isCorrect, 
      correctAnswer: correctAnswerText,
      definition: itemsByWord[currentQuestion.word].definition
    });

    if (isCorrect) {
      setTimeout(() => {
        setLastAnswerResult(null);
        if (questionIndex < currentRound.length - 1) {
          setQuestionIndex(questionIndex + 1);
        } else {
          buildNextRound(updatedProgress);
        } 
      }, 1000);
    }
  };

  const currentQuestion = currentRound[questionIndex];
  const masteredCount = Object.values(wordProgress).filter(p => p.status === 'mastered').length;

  return (
    <div className="mt-6 p-4 border-2 border-dashed border-purple-400 rounded-lg bg-purple-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-purple-800">
          Learning Session
        </h3>
        <div className="text-lg font-semibold bg-green-200 text-green-800 px-3 py-1 rounded-full">
          Mastered: {masteredCount} / {items.length}
        </div>
      </div>
      
      {lastAnswerResult && (
        <FeedbackModal result={lastAnswerResult} onClose={proceedToNextStep} />
      )}

      {!lastAnswerResult && currentQuestion ? (
        <div>
          <p className="text-sm text-gray-600 mb-4">Question {questionIndex + 1} of {currentRound.length}</p>
          <QuestionView question={currentQuestion} onSubmit={handleAnswerSubmit} />
        </div>
      ) : null}

      {!lastAnswerResult && !currentQuestion && (
         <p className="text-center p-8">Loading next round...</p>
      )}
    </div>
  );
};

// --- Main Generator Component ---
type SessionStatus = 'idle' | 'pre-test' | 'pre-test-results' | 'learning';

const PreTestResultsModal: FC<{
  knownWords: string[];
  onConfirm: (wordsToKeep: string[]) => void;
}> = ({ knownWords, onConfirm }) => {
  const [selectedWords, setSelectedWords] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    knownWords.forEach(word => {
      initialState[word] = false; // Default to not reviewing (i.e., skipping)
    });
    return initialState;
  });

  const handleToggle = (word: string) => {
    setSelectedWords(prev => ({ ...prev, [word]: !prev[word] }));
  };

  const handleSelectAll = () => {
    const allSelected: Record<string, boolean> = {};
    knownWords.forEach(word => {
      allSelected[word] = true;
    });
    setSelectedWords(allSelected);
  };

  const handleDeselectAll = () => {
    const noneSelected: Record<string, boolean> = {};
    knownWords.forEach(word => {
      noneSelected[word] = false;
    });
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
        <h2 className="text-2xl font-bold">Pre-Test Complete!</h2>
        <p className="text-gray-600">You answered these words correctly. Untick the words you want to skip in the main session.</p>
        
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
              <label htmlFor={`word-${word}`} className="ml-3 text-lg font-medium text-gray-800">{word}</label>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="space-x-2">
            <button onClick={handleSelectAll} className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded hover:bg-blue-600">Review All</button>
            <button onClick={handleDeselectAll} className="px-4 py-2 text-sm font-semibold text-white bg-gray-500 rounded hover:bg-gray-600">Skip All (Recommended)</button>
          </div>
          <button onClick={handleSubmit} className="bg-green-600 text-white px-8 py-3 rounded-md font-bold text-lg hover:bg-green-700">
            Start Learning
          </button>
        </div>
      </div>
    </div>
  );
};


const PreTestSession: FC<{
  items: QuizItem[];
  onPreTestComplete: (correctWords: string[], incorrectWords: string[]) => void;
}> = ({ items, onPreTestComplete }) => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]);
  const [incorrectAnswers, setIncorrectAnswers] = useState<string[]>([]);

  const preTestQuestions = useMemo(() => {
    return items.map(item => {
      const question: LearningQuestion = {
        word: item.word,
        stage: 4, // All pre-test questions are Stage 4
        item: item,
        options: shuffleArray([item.word, ...shuffleArray(items.map(i => i.word).filter(w => w !== item.word)).slice(0, 6)])
      };
      return question;
    });
  }, [items]);

  const handleAnswerSubmit = (answer: string) => {
    const currentQuestion = preTestQuestions[questionIndex];
    const isCorrect = answer.toLowerCase() === currentQuestion.word.toLowerCase();

    if (isCorrect) {
      setCorrectAnswers(prev => [...prev, currentQuestion.word]);
    } else {
      setIncorrectAnswers(prev => [...prev, currentQuestion.word]);
    }

    const nextIndex = questionIndex + 1;
    if (nextIndex < preTestQuestions.length) {
      setQuestionIndex(nextIndex);
    } else {
      onPreTestComplete(
        isCorrect ? [...correctAnswers, currentQuestion.word] : correctAnswers,
        !isCorrect ? [...incorrectAnswers, currentQuestion.word] : incorrectAnswers
      );
    }
  };
  
  const currentQuestion = preTestQuestions[questionIndex];
  const progress = ((questionIndex) / preTestQuestions.length) * 100;

  return (
    <div className="mt-6 p-4 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50">
        <h3 className="text-xl font-bold text-blue-800 mb-2">Pre-Test Assessment</h3>
        <p className="text-sm text-gray-600 mb-4">Let's see what you already know. This won't affect your final score.</p>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>

        {currentQuestion ? (
            <QuestionView question={currentQuestion} onSubmit={handleAnswerSubmit} />
        ) : (
            <p>Loading pre-test...</p>
        )}
    </div>
  );
};


const rescheduleForTomorrow = async (word: string, username: string) => {
  try {
    await fetch('/api/bookmarks/vocabulary/reschedule-for-tomorrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, word }),
    });
  } catch (error) {
    console.error(`Failed to reschedule word ${word}:`, error);
  }
};

const markWordAsLearned = async (word: string, username: string) => {
    if (!username) return;
    try {
      await fetch('/api/bookmarks/vocabulary/mark-learned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, word }),
      });
    } catch (error) {
      console.error(`Failed to mark word ${word} as learned:`, error);
    }
};

const recordReviewOutcome = async (word: string, is_correct: boolean, username: string) => {
    if (!username) return;
    try {
      await fetch('/api/bookmarks/vocabulary/record-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, word, is_correct }),
      });
    } catch (error) {
      console.error(`Failed to record review outcome for ${word}:`, error);
    }
};


const QuizBatchGenerator = () => {
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [initialProgress, setInitialProgress] = useState<Record<string, WordProgress>>({});
  const { user } = useContext(AuthContext);
  const router = useRouter();
  const { words: wordsQuery, mode } = router.query;

  useEffect(() => {
    if (router.isReady && user && wordsQuery) {
      const decodedWords = decodeURIComponent(wordsQuery as string);
      const words = decodedWords.split(',').filter(Boolean);
      if (words.length > 0) {
        fetchVocabularyContent(words, user.username).then(items => {
          setQuizItems(items);
          setLoading(false);
          setSessionStatus('pre-test'); // Always start with a pre-test
        }).catch(err => {
          console.error(err);
          setLoading(false);
          alert("Failed to load vocabulary content.");
        });
      }
    }
  }, [router.isReady, user, wordsQuery]);

  const handlePreTestComplete = async (correctWords: string[], incorrectWords: string[]) => {
    if (!user) return;

    if (mode === 'review') {
      // Handle review pre-test results
      const correctPromises = correctWords.map(word => recordReviewOutcome(word, true, user.username));
      const incorrectPromises = incorrectWords.map(word => rescheduleForTomorrow(word, user.username));
      await Promise.all([...correctPromises, ...incorrectPromises]);
      
      if (incorrectWords.length > 0) {
        // If some words were failed, start a session with just those
        handleStartLearningSession(incorrectWords, []);
      } else {
        alert("Great job! All review words were answered correctly.");
        router.push('/my-bookmarks'); // Go back to bookmarks page
      }
    } else {
      // Handle initial learning pre-test results
      // For words the user got right, they can choose to skip them.
      // The ones they choose NOT to skip will be added to the learning session.
      // The ones they DO skip are considered mastered and their SRS is initialized.
      setSessionStatus('pre-test-results');
    }
  };

  const handleStartLearningSession = (wordsToLearn: string[], wordsToReview: string[]) => {
    const finalWordList = [...new Set([...wordsToLearn, ...wordsToReview])];
    if (finalWordList.length === 0) {
        alert("Congratulations! You've mastered all the words in this session.");
        router.push('/my-bookmarks');
        return;
    }

    const progress: Record<string, WordProgress> = {};
    finalWordList.forEach(word => {
      progress[word] = { stage: 1, status: 'learning', last_result: null };
    });

    setInitialProgress(progress);
    setSessionStatus('learning');
  };

  const handleConfirmPreTestChoices = async (correctWords: string[], wordsToKeep: string[]) => {
    if(!user) return;
    // Words they got right and chose to SKIP
    const wordsToMarkLearned = correctWords.filter(word => !wordsToKeep.includes(word));
    
    // Initialize SRS for skipped words
    await Promise.all(wordsToMarkLearned.map(word => markWordAsLearned(word, user.username)));

    // Start session with incorrect words + words they chose to keep
    handleStartLearningSession(preTestResults.incorrect, wordsToKeep);
  };

  const [preTestResults, setPreTestResults] = useState<{ correct: string[], incorrect: string[] }>({ correct: [], incorrect: [] });

  const successfulItems = quizItems.filter(item => item.status === 'done');
  const learningItems = successfulItems.filter(item => initialProgress[item.word]);

  return (
    <>
      {sessionStatus === 'pre-test-results' && (
        <PreTestResultsModal 
          knownWords={preTestResults.correct}
          onConfirm={(wordsToKeep) => handleConfirmPreTestChoices(preTestResults.correct, wordsToKeep)}
        />
      )}
      <div className="p-4 border rounded-lg bg-gray-50">
        {loading && <p className="text-center p-8">Loading session...</p>}

        {!loading && sessionStatus === 'pre-test' && (
          <PreTestSession 
            items={successfulItems}
            onPreTestComplete={(correct, incorrect) => {
                setPreTestResults({ correct, incorrect });
                handlePreTestComplete(correct, incorrect);
            }}
          />
        )}

        {sessionStatus === 'learning' && (
          <QuizSession 
            items={learningItems} 
            initialProgress={initialProgress}
            onSessionEnd={() => router.push('/my-bookmarks')}
            mode={mode as string}
          />
        )}
      </div>
    </>
  );
};


const LabPage = () => {
  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <BeakerIcon className="mx-auto h-12 w-12 text-purple-600" />
          <h1 className="mt-4 text-4xl font-extrabold text-gray-900">
            Experimental Lab
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            This area is for batch-generating and testing quiz content.
          </p>
        </div>
        <div className="bg-white p-8 rounded-lg shadow-md animate-fade-in">
          <QuizBatchGenerator />
        </div>
      </div>
    </main>
  );
};

export default LabPage;

