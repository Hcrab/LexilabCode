"use client"
import { useContext, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import AuthContext from '../contexts/AuthContext';
import withAuth from '../components/withAuth';

// --- Data Structure Types ---
interface ResultItem {
  id: string;
  quiz_id: string;
  quiz_name: string;
  score: number;
  total_score: number;
  passed: boolean;
  ts: string;
}

interface UserStats {
  completion_rate: number;
  pass_rate: number;
  average_score: number;
  streak: number;
  completed_quizzes: number;
  total_quizzes: number;
}

interface PendingQuiz {
  quiz_id: string;
  quiz_name: string;
  quiz_type: string;
  status: 'pending';
}

// --- Helper Components ---
const StatCard = ({ title, value, description }: { title: string, value: string, description: string }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
    <h3 className="text-sm font-medium text-gray-500">{title}</h3>
    <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
    <p className="mt-1 text-sm text-gray-500">{description}</p>
  </div>
);

const PendingQuizItem = ({ quiz }: { quiz: PendingQuiz }) => (
    <li className="flex items-center justify-between py-3">
        <div>
            <p className="text-sm font-medium text-gray-900">{quiz.quiz_name}</p>
            <p className="text-sm text-gray-500 capitalize">{quiz.quiz_type} Quiz</p>
        </div>
        <Link href={`/quiz/${quiz.quiz_id}`} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            Start Quiz
        </Link>
    </li>
);


// --- Main Page Component ---
function MyProgress() {
  const { user } = useContext(AuthContext);
  const [recentResults, setRecentResults] = useState<ResultItem[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [pendingQuizzes, setPendingQuizzes] = useState<PendingQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.username) {
      const fetchAllData = async () => {
        try {
          setLoading(true);
          const [statsResponse, resultsResponse, progressResponse] = await Promise.all([
            fetch(`/api/stats/users/${user.username}`),
            fetch(`/api/results?username=${user.username}`),
            fetch(`/api/progress/${user.username}`)
          ]);

          if (!statsResponse.ok) throw new Error('Failed to fetch statistics.');
          if (!resultsResponse.ok) throw new Error('Failed to fetch recent results.');
          if (!progressResponse.ok) throw new Error('Failed to fetch progress.');

          const statsData: UserStats = await statsResponse.json();
          const resultsData: ResultItem[] = await resultsResponse.json();
          const progressData = await progressResponse.json();
          
          const pending = progressData.filter((quiz: any) => quiz.status === 'pending' && (quiz.publish_status === 'publish' || quiz.publish_status == null));

          setStats(statsData);
          setRecentResults(resultsData);
          setPendingQuizzes(pending);

        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
          setLoading(false);
        }
      };
      fetchAllData();
    }
  }, [user]);

  const calculatedStats = useMemo(() => {
    if (!recentResults || recentResults.length === 0) {
      return {
        pass_rate: 0,
        average_score: 0,
      };
    }

    // 1. Get the first attempt for each unique quiz
    const firstAttempts = new Map<string, ResultItem>();
    // The API returns results sorted by date descending, so we iterate backwards
    // to find the earliest (first) attempt for each quiz.
    for (let i = recentResults.length - 1; i >= 0; i--) {
      const result = recentResults[i];
      if (!firstAttempts.has(result.quiz_id)) {
        firstAttempts.set(result.quiz_id, result);
      }
    }
    const firstAttemptList = Array.from(firstAttempts.values());

    // 2. Calculate pass rate (>40%)
    const passedCount = firstAttemptList.reduce((acc, attempt) => {
      const scorePercentage = (attempt.score / attempt.total_score) * 100;
      if (scorePercentage > 40) {
        return acc + 1;
      }
      return acc;
    }, 0);
    const pass_rate = firstAttemptList.length > 0 ? (passedCount / firstAttemptList.length) * 100 : 0;

    // 3. Calculate average score
    const totalScore = firstAttemptList.reduce((acc, attempt) => acc + attempt.score, 0);
    const totalPossibleScore = firstAttemptList.reduce((acc, attempt) => acc + attempt.total_score, 0);
    const average_score = totalPossibleScore > 0 ? (totalScore / totalPossibleScore) * 100 : 0;

    return {
      pass_rate: Math.round(pass_rate),
      average_score: Math.round(average_score),
    };
  }, [recentResults]);

  // --- Render Logic ---
  if (!user) return <p className="p-6 text-center">Please login to view your progress.</p>;
  if (loading) return <p className="p-6 text-center">Loading progress report...</p>;
  if (error) return <p className="p-6 text-center text-red-500">Error: {error}</p>;
  if (!stats) return <p className="p-6 text-center">Could not load statistics.</p>;

  return (
    <main className="bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Progress</h1>

        {/* --- Stats Overview --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard 
            title="Completion Rate" 
            value={`${stats.completion_rate}%`} 
            description={`${stats.completed_quizzes} of ${stats.total_quizzes} quizzes`} 
          />
          <StatCard 
            title="Passing Rate" 
            value={`${calculatedStats.pass_rate}%`} 
            description="Based on first attempts" 
          />
          <StatCard 
            title="Average Score" 
            value={`${calculatedStats.average_score}%`} 
            description="Based on first attempts" 
          />
        </div>

        <div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Quizzes</h2>
            {pendingQuizzes.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                    {pendingQuizzes.map(quiz => <PendingQuizItem key={quiz.quiz_id} quiz={quiz} />)}
                </ul>
            ) : (
                <p className="text-center text-gray-500 py-8">
                    You have completed all available quizzes. Great job!
                </p>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

export default withAuth(MyProgress);