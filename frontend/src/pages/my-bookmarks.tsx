"use client"
import { useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AuthContext from '../contexts/AuthContext'
import { formatToBeijingTime } from '../lib/dateUtils'
import { TrashIcon, BookOpenIcon, DocumentTextIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
import withAuth from '../components/withAuth'

type BookmarkType = 'error_question' | 'vocabulary_word';

interface Bookmark {
  _id: string;
  type: BookmarkType;
  quiz_id?: string;
  result_id?: string;
  question_index?: number;
  user_answer?: string;
  word?: string;
  definition?: string;
  created_at: string;
  quiz_name?: string;
  learned_at?: string; 
  // --- SRS Fields ---
  review_schedule?: string[];
  review_stage_index?: number;
  is_fully_mastered?: boolean;
  // --- New Enhanced Fields ---
  question_prompt?: string;
  correct_answer?: string;
  ai_feedback?: string;
}

// --- Main Component ---
function MyBookmarks() {
  const { user } = useContext(AuthContext)
  const [activeTab, setActiveTab] = useState<BookmarkType>('error_question');
  
  if (!user) return <p className="p-6 text-center">Please log in to see your bookmarks.</p>;

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">My Bookmarks</h1>
      
      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('error_question')}
            className={`${
              activeTab === 'error_question'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm inline-flex items-center`}
          >
            <DocumentTextIcon className="h-5 w-5 mr-2" />
            My Question Log
          </button>
          <button
            onClick={() => setActiveTab('vocabulary_word')}
            className={`${
              activeTab === 'vocabulary_word'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm inline-flex items-center`}
          >
            <BookOpenIcon className="h-5 w-5 mr-2" />
            My Vocabulary
          </button>
        </nav>
      </div>

      {/* Content based on active tab */}
      <div>
        {activeTab === 'error_question' && <ErrorLog user={user} />}
        {activeTab === 'vocabulary_word' && <VocabularyLog user={user} />}
      </div>
    </main>
  );
}


// --- Error Log Component ---
function ErrorLog({ user }: { user: { username: string } }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchErrorQuestions = async () => {
    if (!user?.username) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bookmarks/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, type: 'error_question' })
      });
      if (!res.ok) throw new Error('Failed to fetch error log.');
      const data: Bookmark[] = await res.json();
      setBookmarks(data);
    } catch (error) {
      console.error(error);
      setBookmarks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      fetchErrorQuestions();
    }
  }, [user?.username]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this bookmark?')) return;
    try {
      await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
      fetchErrorQuestions(); // Refresh list
    } catch (error) {
      alert('Failed to delete bookmark.');
    }
  };

  if (isLoading) return <p className="text-center">Loading error log...</p>;
  if (bookmarks.length === 0) return <p className="text-center text-gray-500">You have no bookmarked questions.</p>;

  return (
    <div className="space-y-4">
      {bookmarks.map(b => {
        const isSentence = !!b.ai_feedback; // Heuristic to check if it's a sentence question
        const isFillInBlank = !!b.correct_answer;

        return (
          <div key={b._id} className="p-4 border rounded-lg bg-white shadow-sm">
            <div className="flex justify-between items-start">
              {/* Main Content */}
              <div className="flex-grow">
                <p className="text-sm text-gray-500 mb-2">
                  From quiz: <span className="font-semibold">{b.quiz_name || `Quiz ID: ${b.quiz_id}`}</span>
                </p>
                
                {/* Question Prompt */}
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-600">Question:</p>
                  <p className="text-lg font-semibold text-gray-800 mt-1">
                    {b.question_prompt?.replace('___', `[${b.word}]`) || `Sentence for "${b.word}"`}
                  </p>
                </div>

                {/* Answers and Feedback Section */}
                <div className="space-y-2">
                  {isFillInBlank && (
                    <>
                      <p>Your Answer: <span className="font-mono p-1 bg-gray-100 text-dark-800 rounded">{b.user_answer || 'N/A'}</span></p>
                      <p>Correct Answer: <span className="font-mono p-1 bg-green-100 text-green-800 rounded">{b.correct_answer}</span></p>
                    </>
                  )}
                  {isSentence && (
                    <>
                       <p>Your Answer: <span className="font-mono p-1 bg-gray-200 text-gray-800 rounded">{b.user_answer || 'N/A'}</span></p>
                       <div className="mt-2 text-sm text-blue-700 p-2 bg-blue-100 rounded">
                          <strong>AI Feedback:</strong> {b.ai_feedback}
                       </div>
                    </>
                  )}
                </div>
              </div>
              {/* Delete Button */}
              <button onClick={() => handleDelete(b._id)} className="text-gray-400 hover:text-red-600 ml-4 flex-shrink-0">
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
            
            {/* Footer */}
            <div className="mt-3 pt-3 border-t flex justify-between items-center">
               <p className="text-xs text-gray-400">Bookmarked on: {formatToBeijingTime(b.created_at)}</p>
               <Link href={`/review/attempt/${b.result_id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  View Attempt Details
               </Link>
            </div>
          </div>
        )
      })}
    </div>
  );
}



function getReviewStatus(bookmark: Bookmark): { text: string; color: string; isDue: boolean } {
    if (bookmark.is_fully_mastered) {
        return { text: 'Fully Mastered', color: 'bg-green-200 text-green-800', isDue: false };
    }

    if (bookmark.review_schedule && typeof bookmark.review_stage_index === 'number') {
        const stage = bookmark.review_stage_index;
        if (stage >= bookmark.review_schedule.length) {
            return { text: 'Completed', color: 'bg-green-200 text-green-800', isDue: false };
        }
        
        const nextReviewDate = new Date(bookmark.review_schedule[stage]);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to the start of the day

        if (nextReviewDate <= today) {
            return { text: 'Review Due', color: 'bg-red-200 text-red-800 animate-pulse', isDue: true };
        } else {
            return { text: `Next review: ${formatToBeijingTime(nextReviewDate.toISOString(), 'YYYY-MM-DD')}`, color: 'bg-blue-200 text-blue-800', isDue: false };
        }
    }

    return { text: 'Not yet learned', color: 'bg-gray-200 text-gray-800', isDue: false };
}


// --- Vocabulary Log Component ---
function VocabularyLog({ user }: { user: { username: string } }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newWord, setNewWord] = useState('');
  const [newDefinition, setNewDefinition] = useState('');
  const router = useRouter();

  const fetchVocabulary = async () => {
    if (!user?.username) return; // Guard clause
    setIsLoading(true);
    try {
      // Step 1: Run deduplication process on the backend
      await fetch('/api/bookmarks/vocabulary/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username }),
      });

      // Step 2: Fetch the now-clean list
      const res = await fetch(`/api/bookmarks/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, type: 'vocabulary_word' })
      });
      if (!res.ok) throw new Error('Failed to fetch vocabulary.');
      setBookmarks(await res.json());
    } catch (error) {
      console.error(error);
      setBookmarks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVocabulary();
  }, [user?.username]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this word?')) return;
    try {
      await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
      fetchVocabulary(); // Refresh list
    } catch (error) {
      alert('Failed to delete word.');
    }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !newDefinition.trim()) {
        alert("Word and definition cannot be empty.");
        return;
    }
    try {
        const res = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user.username,
                type: 'vocabulary_word',
                word: newWord,
                definition: newDefinition
            })
        });
        if (!res.ok) throw new Error("Failed to add word.");
        setNewWord('');
        setNewDefinition('');
        fetchVocabulary(); // Refresh list
    } catch (error) {
        alert((error as Error).message);
    }
  }

  const handleStudyUnlearned = () => {
    const wordsToStudy = bookmarks.filter(b => !b.review_schedule).map(b => b.word).filter(Boolean) as string[];
    if (wordsToStudy.length === 0) {
      alert("No new words to learn!");
      return;
    }
    const encodedWords = encodeURIComponent(wordsToStudy.join(','));
    router.push(`/lab?words=${encodedWords}`);
  };

  const handleReviewDue = () => {
    const wordsToReview = bookmarks.filter(b => getReviewStatus(b).isDue).map(b => b.word).filter(Boolean) as string[];
    if (wordsToReview.length === 0) {
      alert("No words are due for review today.");
      return;
    }
    const encodedWords = encodeURIComponent(wordsToReview.join(','));
    // We can reuse the lab, but ideally, this would go to a dedicated review page
    // For now, let's add a mode to the lab
    router.push(`/lab?words=${encodedWords}&mode=review`);
  };

  const sortedBookmarks = [...bookmarks].sort((a, b) => {
    const statusA = getReviewStatus(a);
    const statusB = getReviewStatus(b);
    if (statusA.isDue && !statusB.isDue) return -1;
    if (!statusA.isDue && statusB.isDue) return 1;
    return 0;
  });

  const unlearnedCount = bookmarks.filter(b => !b.review_schedule).length;
  const dueCount = bookmarks.filter(b => getReviewStatus(b).isDue).length;

  return (
    <div>
      {/* Controls: Add new word & Study/Review buttons */}
      <div className="mb-8 p-4 border rounded-lg bg-gray-50 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Add to Vocabulary</h3>
            <form onSubmit={handleAddWord} className="space-y-3">
                <input 
                    type="text" 
                    value={newWord}
                    onChange={e => setNewWord(e.target.value)}
                    placeholder="Enter a new word"
                    className="w-full p-2 border rounded"
                />
                <textarea 
                    value={newDefinition}
                    onChange={e => setNewDefinition(e.target.value)}
                    placeholder="Enter the definition"
                    className="w-full p-2 border rounded"
                    rows={2}
                />
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Add Word
                </button>
            </form>
          </div>

          <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
             <button 
                onClick={handleStudyUnlearned}
                disabled={unlearnedCount === 0 || isLoading}
                className="w-full px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center justify-center disabled:bg-gray-400"
              >
                  <AcademicCapIcon className="h-6 w-6 mr-2" />
                  Study New Words ({unlearnedCount})
              </button>
              <button 
                onClick={handleReviewDue}
                disabled={dueCount === 0 || isLoading}
                className="w-full px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center justify-center disabled:bg-gray-400"
              >
                  <BookOpenIcon className="h-6 w-6 mr-2" />
                  Review Due Words ({dueCount})
              </button>
          </div>
      </div>

      {/* Vocabulary List */}
      {isLoading ? <p className="text-center">Loading vocabulary...</p> :
       bookmarks.length === 0 ? <p className="text-center text-gray-500">Your vocabulary list is empty. Add some words to get started!</p> :
      (
        <div className="space-y-3">
          {sortedBookmarks.map(b => {
            const status = getReviewStatus(b);
            return (
              <div key={b._id} className={`p-4 border rounded-lg shadow-sm ${status.isDue ? 'bg-red-50' : 'bg-white'}`}>
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="text-lg font-bold text-gray-800">{b.word}</p>
                          <p className="mt-1 text-gray-600">{b.definition}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${status.color}`}>
                              {status.text}
                          </span>
                          <button onClick={() => handleDelete(b._id)} className="text-gray-400 hover:text-red-600">
                              <TrashIcon className="h-5 w-5" />
                          </button>
                      </div>
                  </div>
                   <p className="mt-3 pt-2 border-t text-xs text-gray-400">Added on: {formatToBeijingTime(b.created_at)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}

export default withAuth(MyBookmarks)
