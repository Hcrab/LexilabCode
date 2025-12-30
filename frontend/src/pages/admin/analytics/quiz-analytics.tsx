import { useState, useEffect, useMemo } from 'react';
import withAdminAuth from '../../../components/withAdminAuth';
import { authFetch } from '../../../lib/authFetch';
import ReviewAttempt from '../../review/attempt/[result_id]'; // Reusing the component
import { formatToBeijingTime } from '../../../lib/dateUtils';

const API = process.env.NEXT_PUBLIC_API_BASE || '/api';

// ... (interfaces remain the same) ...

interface Question {
  type: 'fill-in-the-blank' | 'sentence';
  word: string;
  question?: string;
  correctAnswer?: string;
}

interface Quiz {
  _id: string;
  name: string;
  type: string;
  data: {
    items: Question[];
  };
}

interface QuizOverviewStat {
  quiz_id: string;
  quiz_name: string;
  total_completion_rate: number;
  css_completion_rate: number;
  total_completed_count: number;
  css_completed_count: number;
  non_css_completed_count: number;
}

interface QuestionStat {
  _id: number; // This should correspond to the index in the quiz's questions array
  question: Question;
  avg_score: number;
  attempts: number;
}

interface Attempt {
  _id: string;
  ts: string;
  correct: number;
  total: number;
  details: {
    questions: any[];
  };
  user: User;
}

interface User {
  username: string;
  english_name?: string;
}

interface CompletedUser {
  user: User;
  attempt: Attempt; // This will now be the first attempt
}

// New component to show a user's attempts
const UserAttemptsModal = ({ user, attempts, onSelectAttempt, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Attempts by {user.english_name || user.username}</h2>
          <button onClick={onClose} className="text-2xl font-bold">&times;</button>
        </div>
        <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
          {attempts.map(attempt => (
            <li key={attempt._id} className="border rounded-lg p-3 hover:bg-gray-50">
              <button onClick={() => onSelectAttempt(attempt)} className="w-full text-left">
                <p><strong>Score:</strong> {attempt.correct} / {attempt.total}</p>
                <p className="text-sm text-gray-600"><strong>Date:</strong> {formatToBeijingTime(attempt.ts)}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};


function QuizAnalyticsPage() {
  const [overviewStats, setOverviewStats] = useState<QuizOverviewStat[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<QuizOverviewStat | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null); // To store the full quiz details
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [allAttempts, setAllAttempts] = useState<Attempt[]>([]); // Store all attempts for the selected quiz
  const [completedUsers, setCompletedUsers] = useState<CompletedUser[]>([]);
  const [notCompletedUsers, setNotCompletedUsers] = useState<User[]>([]);
  
  // State for modals
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userAttempts, setUserAttempts] = useState<Attempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch overview stats on initial load
  useEffect(() => {
    const fetchOverviewStats = async () => {
      setLoading(true);
      try {
        const r = await authFetch(`${API}/analytics/quizzes/overview`);
        if (r.ok) {
          setOverviewStats(await r.json());
        } else {
          setError('Failed to fetch quiz overview stats.');
        }
      } catch (err) {
        setError('An unexpected error occurred while fetching overview stats.');
      } finally {
        setLoading(false);
      }
    };
    fetchOverviewStats();
  }, []);

  // Fetch details when a quiz is selected
  useEffect(() => {
    if (!selectedQuiz) return;

    const fetchQuizDetails = async () => {
      setLoading(true);
      try {
        // Fetch all data in parallel
        const quizPromise = authFetch(`${API}/quizzes/${selectedQuiz.quiz_id}`).then(res => res.json());
        const statsPromise = authFetch(`${API}/stats/quizzes/${selectedQuiz.quiz_id}/question-details`).then(res => res.json());
        const attemptsPromise = authFetch(`${API}/admin/quizzes/${selectedQuiz.quiz_id}/attempts`).then(res => res.json());
        const usersPromise = authFetch(`${API}/usersdata`).then(res => res.json());

        const [quizData, statsData, attemptsData, usersData] = await Promise.all([quizPromise, statsPromise, attemptsPromise, usersPromise]);

        setQuiz(quizData);
        setQuestionStats(statsData);
        setAllAttempts(attemptsData);

        const completedUsernames = new Set(attemptsData.map((a: Attempt) => a.user.username));
        
        const completed = usersData
          .filter((u: User) => completedUsernames.has(u.username))
          .map((u: User) => {
            const userAttempts = attemptsData.filter((a: Attempt) => a.user.username === u.username);
            const firstAttempt = userAttempts.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())[0];
            return { user: u, attempt: firstAttempt };
          });

        const notCompleted = usersData.filter((u: User) => !completedUsernames.has(u.username));

        setCompletedUsers(completed);
        setNotCompletedUsers(notCompleted);

      } catch (err) {
        setError('An unexpected error occurred while fetching quiz details.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizDetails();
    // Reset states when quiz changes
    setSelectedUser(null);
    setUserAttempts([]);
    setSelectedAttempt(null);
  }, [selectedQuiz]);

  const totalAverageScore = useMemo(() => {
    if (!allAttempts || allAttempts.length === 0) {
      return { raw: 0, percentage: 0, totalPossible: 0 };
    }
    const totalCorrect = allAttempts.reduce((sum, attempt) => sum + attempt.correct, 0);
    const totalPossible = allAttempts.reduce((sum, attempt) => sum + attempt.total, 0);
    const raw = totalCorrect / allAttempts.length;
    const percentage = totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0;
    return { raw, percentage, totalPossible };
  }, [allAttempts]);

  const questionWiseDetails = useMemo(() => {
    // The root cause of the ordering issue is that the list of questions
    // was being rendered based on one data source (`quiz.data.items`), while the stats
    // were being matched from another (`questionStats`) using an index that did not align
    // because the order of `quiz.data.items` was incorrect.
    //
    // The `questionStats` data contains the canonical `_id` which represents the true question order,
    // and it also includes the full 'question' object.
    //
    // By using `questionStats` as the primary data source and sorting it by `_id`, we ensure
    // that the questions are displayed in their intended, correct order.
    if (!questionStats) {
      return [];
    }
    // Sort a copy of the array by the canonical question ID to fix the order.
    return [...questionStats].sort((a, b) => a._id - b._id);
  }, [questionStats]);

  const handleViewUserAttempts = (user: User) => {
    const attempts = allAttempts.filter(a => a.user.username === user.username);
    setSelectedUser(user);
    setUserAttempts(attempts);
  };

  const handleSelectAttempt = (attempt: Attempt) => {
    setSelectedAttempt(attempt);
    setSelectedUser(null); // Close the attempts list modal
  };

  const handleBackToOverview = () => {
    setSelectedQuiz(null);
    setQuiz(null);
    setQuestionStats([]);
    setCompletedUsers([]);
    setNotCompletedUsers([]);
  };

  const renderQuestionText = (question: Question) => {
    if (question.type === 'sentence') {
      return `Create a sentence with: "${question.word}"`;
    }
    if (question.type === 'fill-in-the-blank') {
      const questionText = question.question || '___';
      return `Fill in the blank: ${questionText.replace('___', `___ (${question.word})`)}`;
    }
    return 'N/A';
  };

  if (loading && !selectedQuiz) {
    return <main className="p-6"><p>Loading analytics...</p></main>;
  }

  if (error) {
    return <main className="p-6"><p className="text-red-500">{error}</p></main>;
  }

  // Renders the detailed view for a selected quiz
  if (selectedQuiz) {
    return (
      <main className="p-6">
        <button onClick={handleBackToOverview} className="mb-4 text-blue-600 underline">
          &larr; Back to Overview
        </button>
        <h1 className="text-2xl font-bold mb-2">Analytics for: {selectedQuiz.quiz_name}</h1>
        
        {/* Total Average Score */}
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg mb-6 shadow-sm">
          <h2 className="text-xl font-bold mb-2">Quiz Performance Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold">Total Average Score (Raw)</p>
              <p className="text-2xl font-bold">{totalAverageScore.raw.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Total Average Score (%)</p>
              <p className="text-2xl font-bold">{totalAverageScore.percentage.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        {loading && <p>Loading quiz details...</p>}

        {/* Modal for showing a user's attempts */}
        {selectedUser && (
          <UserAttemptsModal 
            user={selectedUser}
            attempts={userAttempts}
            onSelectAttempt={handleSelectAttempt}
            onClose={() => setSelectedUser(null)}
          />
        )}

        {/* Modal for showing the full attempt review */}
        {selectedAttempt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Reviewing Attempt</h2>
                <button onClick={() => setSelectedAttempt(null)} className="text-2xl font-bold">&times;</button>
              </div>
              {/* Here we reuse the ReviewAttempt component by passing result_id */}
              <ReviewAttempt key={selectedAttempt._id} result_id={selectedAttempt._id} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Completed Users */}
          <div>
            <h2 className="text-xl font-bold mb-4">Completed ({completedUsers.length})</h2>
            <div className="bg-white p-4 rounded-lg shadow-md max-h-96 overflow-y-auto">
              <table className="min-w-full text-left">
                <thead className="border-b bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold">Student</th>
                    <th className="p-3 font-semibold">First Attempt Score</th>
                    <th className="p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {completedUsers.map(({ user, attempt }) => (
                    <tr key={user.username} className="border-b hover:bg-gray-50">
                      <td className="p-3">{user.english_name || user.username}</td>
                      <td className="p-3">{attempt.correct} / {attempt.total}</td>
                      <td className="p-3">
                        <button onClick={() => handleViewUserAttempts(user)} className="text-blue-600 underline">
                          View Attempts
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Not Completed Users */}
          <div>
            <h2 className="text-xl font-bold mb-4">Not Completed ({notCompletedUsers.length})</h2>
            <div className="bg-white p-4 rounded-lg shadow-md max-h-96 overflow-y-auto">
              <table className="min-w-full text-left">
                <thead className="border-b bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold">Student</th>
                  </tr>
                </thead>
                <tbody>
                  {notCompletedUsers.map(user => (
                    <tr key={user.username} className="border-b hover:bg-gray-50">
                      <td className="p-3">{user.english_name || user.username}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold mt-8 mb-4">Question-wise Details</h2>
        <div className="bg-white p-4 rounded-lg shadow-md">
          <table className="min-w-full text-left">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">Question</th>
                <th className="p-3 font-semibold">Average Score</th>
                <th className="p-3 font-semibold">Total Attempts</th>
              </tr>
            </thead>
            <tbody>
              {questionWiseDetails.map((stat) => (
                  <tr key={stat._id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-gray-500">{stat._id + 1}</td>
                    <td className="p-3">{renderQuestionText(stat.question)}</td>
                    <td className="p-3">{stat.avg_score.toFixed(2)}</td>
                    <td className="p-3">{stat.attempts}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    );
  }

  // Renders the main overview table
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">Quiz Analytics Overview</h1>
      <div className="bg-white p-4 rounded-lg shadow-md">
        <table className="min-w-full text-left">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3 font-semibold">Quiz Name</th>
              <th className="p-3 font-semibold">Total Completion</th>
              <th className="p-3 font-semibold">CSS User Completion</th>
            </tr>
          </thead>
          <tbody>
            {overviewStats.map(stat => (
              <tr key={stat.quiz_id} className="border-b hover:bg-gray-50">
                <td className="p-3">
                  <button onClick={() => setSelectedQuiz(stat)} className="text-blue-600 underline font-semibold">
                    {stat.quiz_name}
                  </button>
                </td>
                <td className="p-3">
                  {stat.total_completion_rate}% 
                  <span className="text-gray-600 text-sm ml-2">
                    ({stat.total_completed_count} users)
                  </span>
                </td>
                <td className="p-3">
                  {stat.css_completion_rate}%
                  <span className="text-gray-600 text-sm ml-2">
                    ({stat.css_completed_count} CSS / {stat.non_css_completed_count} Non-CSS)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default withAdminAuth(QuizAnalyticsPage);
