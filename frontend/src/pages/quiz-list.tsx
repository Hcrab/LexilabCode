"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StarIcon, ClockIcon, CalendarDaysIcon } from '@heroicons/react/24/solid'
import { formatToBeijingTime } from '../lib/dateUtils'
import withAuth from '../components/withAuth'

interface Quiz {
  _id: string; // Keep original _id from MongoDB
  id: string;
  name: string;
  type: string;
  created_at: string;
  publish_at?: string;
}

function QuizList() {
  const [recentQuizzes, setRecentQuizzes] = useState<Quiz[]>([]);
  const [pastQuizzes, setPastQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuizzes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch the full list of quizzes
        const res = await fetch('/api/quizzes?per_page=9999');

        if (!res.ok) throw new Error('Failed to fetch the quiz list.');
        
        const response = await res.json();
        const allQuizzesData: any[] = response.quizzes || [];

        // Map _id to id for frontend consistency
        const allQuizzes = allQuizzesData.map(q => ({ ...q, id: q._id }));

        // Logic to filter recent quizzes
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const recent = allQuizzes.filter(quiz => {
          if (!quiz.publish_at) return false;
          const publishedDate = new Date(quiz.publish_at);
          return publishedDate >= fortyEightHoursAgo && publishedDate <= now;
        });

        const recentIds = new Set(recent.map(q => q.id));
        const past = allQuizzes.filter(q => !recentIds.has(q.id));

        setRecentQuizzes(recent);
        setPastQuizzes(past);

      } catch (err) {
        setError((err as Error).message);
        setPastQuizzes([]); // Ensure state is an array on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuizzes();
  }, []);

  const renderQuizCard = (quiz: Quiz, isRecent: boolean = false) => (
    <li key={quiz.id} className={`border rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-200 ${isRecent ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' : 'bg-white'}`}>
      <Link href={`/quiz/${quiz.id}`} className="block p-5">
        <div className="flex justify-between items-start">
          <p className="font-bold text-lg text-gray-800">{quiz.name}</p>
          {isRecent && <StarIcon className="h-6 w-6 text-yellow-400" />}
        </div>
        <div className="flex items-center text-sm text-gray-500 mt-3">
          <ClockIcon className="h-4 w-4 mr-1.5" />
          <span>
            {quiz.publish_at ? 'Published' : 'Created'}: {formatToBeijingTime(quiz.publish_at || quiz.created_at)}
          </span>
        </div>
      </Link>
    </li>
  );

  if (isLoading) return <p className="p-8 text-center text-gray-600">Loading quizzes...</p>;
  if (error) return <p className="p-8 text-center text-red-600 font-semibold">Error: {error}</p>;

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-4xl font-extrabold text-gray-800 mb-8 tracking-tight">Quiz Library</h1>
      
      {/* Recent Quizzes Section */}
      <section className="mb-10">
        <div className="flex items-center mb-4">
          <CalendarDaysIcon className="h-7 w-7 text-blue-600 mr-3"/>
          <h2 className="text-2xl font-bold text-gray-700">Recent Quizzes</h2>
        </div>
        {recentQuizzes.length > 0 ? (
          <ul className="space-y-3">
            {recentQuizzes.map(quiz => renderQuizCard(quiz, true))}
          </ul>
        ) : (
          <div className="text-center py-6 px-4 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No recent quizzes available.</p>
          </div>
        )}
      </section>

      {/* Past Quizzes Section */}
      <section>
        <h2 className="text-2xl font-bold text-gray-700 mb-4 border-t pt-6">Past Quizzes</h2>
        {pastQuizzes.length > 0 ? (
          <ul className="space-y-4">
            {pastQuizzes.map(quiz => renderQuizCard(quiz))}
          </ul>
        ) : (
          <div className="text-center py-6 px-4 bg-gray-50 rounded-lg">
            <p className="text-gray-500">There are no past quizzes to show.</p>
          </div>
        )}
      </section>
    </main>
  );
}

export default withAuth(QuizList)
