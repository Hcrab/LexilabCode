import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StarIcon, ClockIcon, CalendarDaysIcon } from '@heroicons/react/24/solid';

const API = '/api';

const formatToBeijingTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(d);
  } catch (_) {
    return isoString;
  }
};

export default function StudentQuizListPage() {
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [pastQuizzes, setPastQuizzes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasTeacher, setHasTeacher] = useState(null); // null=unknown, boolean afterwards

  useEffect(() => {
    const fetchQuizzes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        // Fetch summary to infer whether user is linked to any teacher/class
        try {
          const sumRes = await fetch(`/api/student/dashboard-summary`, { headers: { Authorization: `Bearer ${token}` } });
          if (sumRes.ok) {
            const sum = await sumRes.json();
            setHasTeacher(Boolean(sum?.has_teacher));
          }
        } catch (_) {}

        const res = await fetch(`${API}/student/quizzes?per_page=9999`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch the quiz list.');
        const response = await res.json();
        const allQuizzesData = response.quizzes || [];
        const allQuizzes = allQuizzesData.map(q => ({ ...q, id: q._id }));

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
        setError(err.message || 'Failed to fetch');
        setPastQuizzes([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuizzes();
  }, []);

  const renderQuizCard = (quiz, isRecent = false) => (
    <li key={quiz.id} className={`border rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-200 ${isRecent ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' : 'bg-white'}`}>
      <Link to={`/quiz/${quiz.id}`} className="block p-5">
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
            {hasTeacher === false ? (
              <p className="text-gray-500">You are not enrolled in any class. No quizzes are available.</p>
            ) : (
              <p className="text-gray-500">No recent quizzes available.</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold text-gray-700 mb-4 border-t pt-6">Past Quizzes</h2>
        {pastQuizzes.length > 0 ? (
          <ul className="space-y-4">
            {pastQuizzes.map(quiz => renderQuizCard(quiz))}
          </ul>
        ) : (
          <div className="text-center py-6 px-4 bg-gray-50 rounded-lg">
            {hasTeacher === false ? (
              <p className="text-gray-500">You are not enrolled in any class. No quizzes are available.</p>
            ) : (
              <p className="text-gray-500">There are no past quizzes to show.</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
