import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

export default function ReviewQuizAttemptsPage() {
  const { quizId } = useParams();
  const [results, setResults] = useState([]);
  const [quizName, setQuizName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true); setError(null);
      try {
        const r = await fetch(`${API}/results/quizzes/${quizId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to fetch attempts.');
        const sorted = (data || []).sort((a, b) => new Date(b.ts) - new Date(a.ts));
        setResults(sorted);
        if (sorted.length > 0) setQuizName(sorted[0].quiz_name || 'Quiz');
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    };
    if (quizId) load();
  }, [quizId]);

  if (isLoading) return <p className="p-6 text-center">Loading attempt history...</p>;
  if (error) return <p className="p-6 text-center text-red-500">{error}</p>;

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Review Attempts</h1>
      <h2 className="text-xl text-gray-600 mb-6">{quizName}</h2>

      {results.length === 0 ? (
        <p className="text-center text-gray-500">No attempts found for this quiz.</p>
      ) : (
        <ul className="space-y-3">
          {results.map(result => (
            <li key={result.id} className="border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white">
              <Link to={`/review/attempt/${result.id}`} className="flex justify-between items-center p-4">
                <div>
                  <p className="font-semibold text-lg text-gray-800">
                    Attempt on {formatToBeijingTime(result.ts)}
                  </p>
                  <p className={`text-md mt-1 font-medium ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                    Score: {result.score} / {result.total_score}
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
