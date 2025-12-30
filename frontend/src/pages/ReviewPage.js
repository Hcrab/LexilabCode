import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/24/solid';

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

export default function ReviewPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true); setError(null);
      try {
        const r = await fetch(`${API}/results`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load results');
        // Aggregate by quiz_id keeping latest ts
        const map = new Map();
        (data || []).forEach(item => {
          const key = item.quiz_id || 'unknown';
          const existing = map.get(key);
          if (existing) {
            existing.attempt_count += 1;
            if (new Date(item.ts) > new Date(existing.last_attempt_ts)) existing.last_attempt_ts = item.ts;
          } else {
            map.set(key, {
              quiz_id: key,
              quiz_name: item.quiz_name || 'Quiz',
              attempt_count: 1,
              last_attempt_ts: item.ts,
            });
          }
        });
        const sorted = Array.from(map.values()).sort((a, b) => new Date(b.last_attempt_ts) - new Date(a.last_attempt_ts));
        setQuizzes(sorted);
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) return <p className="p-6">Loading review history...</p>;
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>;

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Review Past Quizzes</h1>
      {quizzes.length === 0 ? (
        <p className="text-center text-gray-500">You have not completed any quizzes yet.</p>
      ) : (
        <ul className="space-y-3">
          {quizzes.map(quiz => (
            <li key={quiz.quiz_id} className="border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white">
              <Link to={`/review/${quiz.quiz_id}`} className="flex justify-between items-center p-4">
                <div>
                  <p className="font-semibold text-lg text-gray-800">{quiz.quiz_name}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {quiz.attempt_count} {quiz.attempt_count > 1 ? 'attempts' : 'attempt'} - Last on {formatToBeijingTime(quiz.last_attempt_ts)}
                  </p>
                </div>
                <ChevronRightIcon className="h-6 w-6 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
