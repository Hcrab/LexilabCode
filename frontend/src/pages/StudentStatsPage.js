import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiTrendingUp, FiRefreshCw, FiCheckCircle, FiTarget } from 'react-icons/fi';

const StudentStatsPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  // Quiz-related states
  const [quizStats, setQuizStats] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [pendingQuizzes, setPendingQuizzes] = useState([]);
  const [quizError, setQuizError] = useState('');
  const [quizLoading, setQuizLoading] = useState(true);
  // Expandable per-day details (must declare hooks before any early return)
  const [openDates, setOpenDates] = useState(new Set());
  const toggleOpen = (d) => {
    setOpenDates(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/student/study-stats?days=30', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load');
      setData(json);
      setGoal(String(json.learning_goal || 0));
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load quiz-related stats and progress (requires username from profile)
  useEffect(() => {
    const loadQuizData = async () => {
      setQuizLoading(true); setQuizError('');
      try {
        const token = localStorage.getItem('token');
        const profRes = await fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } });
        const profile = await profRes.json();
        if (!profRes.ok) throw new Error(profile?.message || 'Failed to load profile');
        const username = profile?.username;
        if (!username) throw new Error('Missing username');

        const [statsRes, resultsRes, progressRes] = await Promise.all([
          fetch(`/api/stats/users/${username}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/results`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/progress/${username}`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        const s = await statsRes.json();
        const r = await resultsRes.json();
        const p = await progressRes.json();
        if (!statsRes.ok) throw new Error(s?.error || 'Failed to load quiz stats');
        if (!resultsRes.ok) throw new Error(r?.error || 'Failed to load quiz results');
        if (!progressRes.ok) throw new Error(p?.error || 'Failed to load pending quizzes');

        setQuizStats(s);
        setRecentResults(Array.isArray(r) ? r : []);
        // filter pending: status === 'pending' and published
        const pend = (Array.isArray(p) ? p : []).filter(q => q.status === 'pending' && (!q.publish_status || q.publish_status === 'published'));
        setPendingQuizzes(pend);
      } catch (e) {
        setQuizError(e?.message || 'Failed to load quiz data');
        setQuizStats(null);
        setRecentResults([]);
        setPendingQuizzes([]);
      } finally {
        setQuizLoading(false);
      }
    };
    loadQuizData();
  }, []);

  const calculatedStats = useMemo(() => {
    if (!recentResults || recentResults.length === 0) {
      return { pass_rate: 0, average_score: 0 };
    }
    // first attempts per quiz (earliest per quiz)
    const firstAttempts = new Map();
    for (let i = recentResults.length - 1; i >= 0; i--) {
      const res = recentResults[i];
      if (!firstAttempts.has(res.quiz_id)) firstAttempts.set(res.quiz_id, res);
    }
    const list = Array.from(firstAttempts.values());
    const passed = list.reduce((acc, a) => {
      const total = (a.total_score != null ? a.total_score : a.total);
      return acc + ((((a.score || a.correct || 0) / Math.max(1, total || 0)) * 100) > 40 ? 1 : 0);
    }, 0);
    const pass_rate = list.length > 0 ? Math.round((passed / list.length) * 100) : 0;
    const totalScore = list.reduce((acc, a) => acc + (a.score || a.correct || 0), 0);
    const totalPossible = list.reduce((acc, a) => {
      const total = (a.total_score != null ? a.total_score : a.total);
      return acc + Math.max(1, total || 0);
    }, 0);
    const average_score = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;
    return { pass_rate, average_score };
  }, [recentResults]);

  const saveGoal = async () => {
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const g = parseInt(goal, 10) || 0;
      const res = await fetch('/api/student/learning-goal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goal: g })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Save failed');
      await load();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  const items = Array.isArray(data?.by_day) ? data.by_day : [];
  // Descending order: latest day first
  const itemsDesc = [...items].reverse();
  const today = items.length > 0 ? items[items.length - 1] : { date: '', learned: 0, reviewed: 0 };
  const todayGoal = parseInt(data?.learning_goal || 0, 10) || 0;
  const todayTotal = data?.today_total_learned ?? (today?.learned || 0);
  const todaySecret = data?.has_secret ? (data?.today_secret_learned || 0) : null;
  const goalBasis = data?.has_secret ? (todaySecret || 0) : todayTotal;
  const goalMetToday = todayGoal > 0 && goalBasis >= todayGoal;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Progress Tracker</h1>
      <h2 className="text-xl font-semibold text-gray-900 mb-3">Quiz Analytics</h2>
      {/* Quiz Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-600">Completion Rate</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{quizStats ? `${quizStats.completion_rate}%` : (quizLoading ? '…' : '0%')}</div>
          <div className="text-sm text-gray-500">{quizStats ? `${quizStats.completed_quizzes} of ${quizStats.total_quizzes} quizzes` : ''}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-600">Passing Rate</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{`${calculatedStats.pass_rate}%`}</div>
          <div className="text-sm text-gray-500">Based on first attempts</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-600">Average Score</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{`${calculatedStats.average_score}%`}</div>
          <div className="text-sm text-gray-500">Based on first attempts</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Quizzes</h2>
        {quizLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : quizError ? (
          <p className="text-red-600">{quizError}</p>
        ) : pendingQuizzes.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {pendingQuizzes.map(q => (
              <li key={q.quiz_id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{q.quiz_name}</p>
                  <p className="text-sm text-gray-500 capitalize">{q.quiz_type} Quiz</p>
                </div>
                <Link to={`/quiz/${q.quiz_id}`} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  Start Quiz
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-500">You have completed all available quizzes. Great job!</p>
        )}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-3 mt-10">Vocabulary Stats</h2>
      {/* Today Hero Section - redesigned */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-6 rounded-2xl border shadow-sm bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-center gap-3 text-blue-700">
            <FiTrendingUp size={22} />
            <span className="text-sm">Today ({today?.date || '—'})</span>
          </div>
          <div className="mt-2 text-4xl font-extrabold text-gray-900">{todayTotal}</div>
          <div className="text-sm text-gray-600">Words Learned</div>
          {data?.has_secret && (
            <div className="mt-1 text-xs text-gray-700">From Secret Wordbook: <span className="font-semibold">{todaySecret}</span></div>
          )}
        </div>
        <div className="p-6 rounded-2xl border shadow-sm bg-gradient-to-br from-emerald-50 to-white">
          <div className="flex items-center gap-3 text-emerald-700">
            <FiRefreshCw size={22} />
            <span className="text-sm">Reviewed Today</span>
          </div>
          <div className="mt-2 text-4xl font-extrabold text-gray-900">{today?.reviewed || 0}</div>
          <div className="text-sm text-gray-600">Words Reviewed</div>
        </div>
        <div className="p-6 rounded-2xl border shadow-sm bg-white">
          <div className="flex items-center gap-2 text-sm">
            <FiCheckCircle className={data?.today_review_done ? 'text-green-600' : 'text-yellow-600'} />
            <span className={data?.today_review_done ? 'text-green-700' : 'text-yellow-700'}>
              Review Today {data?.today_review_done ? 'Done' : 'Not done'}
            </span>
          </div>
          <div className="mt-2 text-sm text-gray-600">Consecutive days achieved: <span className="font-semibold text-gray-800">{data?.goal_streak_days || 0}</span> days</div>
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <FiTarget />
              <span>Daily learning goal</span>
              {todayGoal > 0 && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${goalMetToday ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {goalMetToday ? 'Achieved today' : 'Not achieved today'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input value={goal} onChange={e=>setGoal(e.target.value)} type="number" min="0" max="500" className="p-2 border rounded w-28" />
              <button onClick={saveGoal} disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50 text-sm">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Learned</th>
                <th className="p-3">Reviewed</th>
                <th className="p-3">Review Done</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {itemsDesc.map((d) => (
                <>
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-700">{d.date}</td>
                    <td className="p-3 font-semibold text-gray-900">{d.learned}</td>
                    <td className="p-3 font-semibold text-gray-900">{d.reviewed}</td>
                    <td className="p-3">
                      {d.review_done ? (
                        <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">Done</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">Pending</span>
                      )}
                    </td>
                    <td className="p-3">
                      <button onClick={()=>toggleOpen(d.date)} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm">
                        {openDates.has(d.date) ? 'Collapse' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {openDates.has(d.date) && (
                    <tr key={`${d.date}-details`} className="bg-gray-50">
                      <td className="p-3" colSpan={4}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-gray-700 mb-2">Words Learned:</div>
                            {Array.isArray(d.learned_words) && d.learned_words.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {d.learned_words.map((w, i) => (
                                  <span key={i} className="px-2 py-1 bg-white border rounded text-sm">{w}</span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">No records</div>
                            )}
                          </div>
                          <div>
                            <div className="text-sm text-gray-700 mb-2">Words Reviewed:</div>
                            {Array.isArray(d.reviewed_words) && d.reviewed_words.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {d.reviewed_words.map((w, i) => (
                                  <span key={i} className="px-2 py-1 bg-white border rounded text-sm">{w}</span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">No records</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StudentStatsPage;
