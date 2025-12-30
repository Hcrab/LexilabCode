import { useState, useEffect } from 'react';
import withAdminAuth from '../../../components/withAdminAuth';
import { authFetch } from '../../../lib/authFetch';
import ReviewAttempt from '../../review/attempt/[result_id]';
import { formatToBeijingTime } from '../../../lib/dateUtils';

const API = process.env.NEXT_PUBLIC_API_BASE || '/api';

// Interfaces
interface User {
  _id: string;
  username: string;
  english_name?: string;
  role: string;
}

interface UserOverviewStat {
  user: User;
  completed_quizzes: number;
  total_quizzes: number;
  completion_rate: number;
  average_score: number;
}

interface UserProgress {
  quiz_id: string;
  quiz_name: string;
  quiz_type: string;
  status: 'completed' | 'pending';
  first_attempt?: {
    score: number;
    total_score: number;
    passed: boolean;
    attempt_date: string;
    result_id: string;
  };
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
  quiz_name: string;
}

// Reusable Modals (from QuizAnalytics)
const UserAttemptsModal = ({ user, quizName, attempts, onSelectAttempt, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Attempts for {quizName}</h2>
          <button onClick={onClose} className="text-2xl font-bold">&times;</button>
        </div>
        <p className="mb-4 text-gray-600">Student: {user.english_name || user.username}</p>
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

const ReviewAttemptModal = ({ attempt, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Reviewing Attempt</h2>
          <button onClick={onClose} className="text-2xl font-bold">&times;</button>
        </div>
        <ReviewAttempt key={attempt._id} result_id={attempt._id} />
      </div>
    </div>
  );
};


function UserInsightsPage() {
  const [overviewStats, setOverviewStats] = useState<UserOverviewStat[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);
  const [userAttempts, setUserAttempts] = useState<Attempt[]>([]);
  const [selectedQuizName, setSelectedQuizName] = useState<string>('');
  const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch overview stats on initial load
  useEffect(() => {
    const fetchOverviewStatsAndCalculateAverages = async () => {
      setLoading(true);
      setError('');
      try {
        const overviewResponse = await authFetch(`${API}/analytics/users/overview`);
        if (!overviewResponse.ok) {
          setError('Failed to fetch user overview stats.');
          setLoading(false);
          return;
        }
        
        const overviewData: UserOverviewStat[] = await overviewResponse.json();

        const statsWithCalculatedAverages = await Promise.all(
          overviewData.map(async (stat) => {
            try {
              const progressResponse = await authFetch(`${API}/progress/${stat.user.username}`);
              if (progressResponse.ok) {
                const userProgress: UserProgress[] = await progressResponse.json();
                
                const completedQuizzesWithAttempts = userProgress.filter(p => p.status === 'completed' && p.first_attempt);
                
                const totalScore = completedQuizzesWithAttempts.reduce((acc, progress) => acc + (progress.first_attempt?.score || 0), 0);
                const totalPossibleScore = completedQuizzesWithAttempts.reduce((acc, progress) => acc + (progress.first_attempt?.total_score || 0), 0);
                
                const averageScore = totalPossibleScore > 0 ? (totalScore / totalPossibleScore) * 100 : 0;

                return { ...stat, average_score: averageScore };
              }
              return { ...stat, average_score: 0 }; 
            } catch (e) {
              return { ...stat, average_score: 0 };
            }
          })
        );

        setOverviewStats(statsWithCalculatedAverages);

      } catch (err) {
        setError('An unexpected error occurred while fetching overview stats.');
      } finally {
        setLoading(false);
      }
    };
    fetchOverviewStatsAndCalculateAverages();
  }, []);

  // Fetch progress details when a user is selected
  useEffect(() => {
    if (!selectedUser) return;

    const fetchUserProgress = async () => {
      setLoading(true);
      try {
        const r = await authFetch(`${API}/progress/${selectedUser.username}`);
        if (r.ok) {
          setUserProgress(await r.json());
        } else {
          setError(`Failed to fetch progress for ${selectedUser.username}`);
        }
      } catch (err) {
        setError('An unexpected error occurred while fetching user progress.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProgress();
    // Reset other states
    setUserAttempts([]);
    setSelectedAttempt(null);
  }, [selectedUser]);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
  };

  const handleBackToOverview = () => {
    setSelectedUser(null);
    setUserProgress([]);
  };

  const handleViewAttempts = async (quizId: string, quizName: string) => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const r = await authFetch(`${API}/admin/quizzes/${quizId}/attempts?username=${selectedUser.username}`);
      if (r.ok) {
        const attempts = await r.json();
        setUserAttempts(attempts);
        setSelectedQuizName(quizName);
      } else {
        setError('Failed to fetch user attempts for this quiz.');
      }
    } catch (err) {
      setError('An error occurred while fetching attempts.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAttempt = (attempt: Attempt) => {
    setSelectedAttempt(attempt);
    setUserAttempts([]); // Close the attempts list modal
  };

  if (loading && !selectedUser && overviewStats.length === 0) {
    return <main className="p-6"><p>Loading user insights...</p></main>;
  }

  if (error) {
    return <main className="p-6"><p className="text-red-500">{error}</p></main>;
  }

  // Renders the detailed view for a selected user
  if (selectedUser) {
    const completedQuizzesWithAttempts = userProgress.filter(p => p.status === 'completed' && p.first_attempt);
    
    const totalScore = completedQuizzesWithAttempts.reduce((acc, progress) => acc + (progress.first_attempt?.score || 0), 0);
    const totalPossibleScore = completedQuizzesWithAttempts.reduce((acc, progress) => acc + (progress.first_attempt?.total_score || 0), 0);
    
    const averageScore = totalPossibleScore > 0 ? (totalScore / totalPossibleScore) * 100 : 0;

    return (
      <main className="p-6">
        <button onClick={handleBackToOverview} className="mb-4 text-blue-600 underline">
          &larr; Back to User Overview
        </button>
        <h1 className="text-2xl font-bold mb-4">Progress for: {selectedUser.english_name || selectedUser.username}</h1>
        
        <div className="mb-4 bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200">
          <h2 className="text-lg font-semibold text-gray-800">Calculated Average Score</h2>
          <p className="text-3xl font-bold text-blue-600">{averageScore.toFixed(2)}%</p>
          <p className="text-sm text-gray-600">Based on first attempts of completed quizzes.</p>
        </div>

        {loading && <p>Loading progress...</p>}

        {/* Modals */}
        {userAttempts.length > 0 && (
          <UserAttemptsModal
            user={selectedUser}
            quizName={selectedQuizName}
            attempts={userAttempts}
            onSelectAttempt={handleSelectAttempt}
            onClose={() => setUserAttempts([])}
          />
        )}
        {selectedAttempt && (
          <ReviewAttemptModal
            attempt={selectedAttempt}
            onClose={() => setSelectedAttempt(null)}
          />
        )}

        <div className="bg-white p-4 rounded-lg shadow-md">
          <table className="min-w-full text-left">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3 font-semibold">Quiz Name</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">First Attempt Score</th>
                <th className="p-3 font-semibold">Attempt Date</th>
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {userProgress.map(progress => (
                <tr key={progress.quiz_id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{progress.quiz_name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      progress.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {progress.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {progress.first_attempt ? `${progress.first_attempt.score} / ${progress.first_attempt.total_score}` : 'N/A'}
                  </td>
                  <td className="p-3">
                    {progress.first_attempt ? formatToBeijingTime(progress.first_attempt.attempt_date) : 'N/A'}
                  </td>
                  <td className="p-3">
                    {progress.status === 'completed' && (
                      <button 
                        onClick={() => handleViewAttempts(progress.quiz_id, progress.quiz_name)} 
                        className="text-blue-600 underline"
                      >
                        View Attempts
                      </button>
                    )}
                  </td>
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
      <h1 className="text-2xl font-bold mb-6">User Insights Overview</h1>
      <div className="bg-white p-4 rounded-lg shadow-md">
        <table className="min-w-full text-left">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3 font-semibold">Student Name</th>
              <th className="p-3 font-semibold">Completion Rate</th>
              <th className="p-3 font-semibold">Average Score</th>
              <th className="p-3 font-semibold">Quizzes Completed</th>
            </tr>
          </thead>
          <tbody>
            {overviewStats.map(stat => (
              <tr key={stat.user._id} className="border-b hover:bg-gray-50">
                <td className="p-3">
                  <button onClick={() => handleSelectUser(stat.user)} className="text-blue-600 underline font-semibold">
                    {stat.user.english_name || stat.user.username}
                  </button>
                </td>
                <td className="p-3">{stat.completion_rate}%</td>
                <td className="p-3">{stat.average_score.toFixed(2)}%</td>
                <td className="p-3">{stat.completed_quizzes} / {stat.total_quizzes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default withAdminAuth(UserInsightsPage);