import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
// Exam stats now navigates to a dedicated page

const ClassStatsPage = () => {
    const { classId } = useParams();
    const [stats, setStats] = useState([]);
    const [view, setView] = useState('student'); // 'student' | 'quiz'
    // quiz view state
    const [quizzes, setQuizzes] = useState([]);
    const [quizLoading, setQuizLoading] = useState(false);
    const [quizError, setQuizError] = useState('');
    const [selectedQuiz, setSelectedQuiz] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [attemptsLoading, setAttemptsLoading] = useState(false);
    const [attemptDetail, setAttemptDetail] = useState(null); // legacy details (unused when using iframe)
    const [attemptDetailLoading, setAttemptDetailLoading] = useState(false);
    const [attemptDetailError, setAttemptDetailError] = useState('');
    const [attemptDetailId, setAttemptDetailId] = useState(null); // use iframe to reuse review page
    // Exam-related stats removed in simplified app
    const [className, setClassName] = useState('');
    const [classStudents, setClassStudents] = useState([]); // {_id, username, nickname}
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Single tab view (students only)

    // Set default start date to 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [startDate, setStartDate] = useState(sevenDaysAgo.toISOString().split('T')[0]);

    const [sortConfig, setSortConfig] = useState({ key: 'username', direction: 'ascending' });

    useEffect(() => {
        const fetchClassName = async () => {
            try {
                const token = localStorage.getItem('token');
                const classDetailsRes = await fetch(`/api/classes/${classId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!classDetailsRes.ok) throw new Error('Failed to fetch class name');
                const classData = await classDetailsRes.json();
                setClassName(classData.name);
                setClassStudents(Array.isArray(classData?.students) ? classData.students : []);
            } catch (err) {
                setError(err.message);
            }
        };
        fetchClassName();
    }, [classId]);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const statsRes = await fetch(`/api/classes/${classId}/stats?start_date=${startDate}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!statsRes.ok) throw new Error('Failed to fetch class statistics');
                const statsData = await statsRes.json();
                setStats(statsData);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        if (view === 'student') {
            fetchStats();
        }
    }, [classId, startDate, view]);

    useEffect(() => {
        const fetchQuizzes = async () => {
            setQuizLoading(true); setQuizError('');
            try {
                const token = localStorage.getItem('token');
                const r = await fetch(`/api/admin/classes/${classId}/quizzes`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await r.json().catch(()=>[]);
                if (!r.ok) throw new Error(data?.error || 'Failed to fetch quiz data');
                setQuizzes(Array.isArray(data) ? data : []);
            } catch (e) {
                setQuizError(e.message || 'Failed to fetch quiz data');
            } finally {
                setQuizLoading(false);
            }
        };
        if (view === 'quiz') fetchQuizzes();
    }, [classId, view]);

    const sortedStats = useMemo(() => {
        let sortableItems = [...stats];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [stats, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return '↕';
        return sortConfig.direction === 'ascending' ? '↑' : '↓';
    };

    const handleDateChange = (e) => {
        setStartDate(e.target.value);
    };

    const openAttemptDetail = (resultId) => {
        setAttemptDetailError('');
        setAttemptDetail(null);
        setAttemptDetailId(resultId);
    };

    // Exam click removed

    const renderStudentStats = () => (
        <div className="bg-white shadow-lg rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {['username', 'learning_completion_rate', 'review_completion_rate', 'assignment_completion_rate', 'completed_today_learning', 'completed_today_review'].map(col => (
                            <th key={col} scope="col" onClick={() => requestSort(col)}
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                                {
                                    {
                                        'username': 'Student',
                                        'learning_completion_rate': 'New word task completion',
                                        'review_completion_rate': 'Review task completion',
                                        'assignment_completion_rate': 'Assignment completion',
                                        'completed_today_learning': 'New words today',
                                        'completed_today_review': 'Reviews today'
                                    }[col]
                                }
                                <span className="ml-2">{getSortIndicator(col)}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {sortedStats.map(stat => (
                        <tr key={stat.student_id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <Link to={`/admin/student/${stat.student_id}?back=${encodeURIComponent(`/admin/class/${classId}/stats`)}`} className="text-blue-600 hover:underline">
                                    <div className="text-sm font-medium text-gray-900">{stat.nickname || stat.username}</div>
                                    <div className="text-sm text-gray-500">{stat.username}</div>
                                </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{stat.learning_completion_rate}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{stat.review_completion_rate}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{stat.assignment_completion_rate}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                {stat.completed_today_learning ? <CheckCircleIcon className="h-6 w-6 text-green-500" /> : <XCircleIcon className="h-6 w-6 text-red-500" />}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                {stat.completed_today_review ? <CheckCircleIcon className="h-6 w-6 text-green-500" /> : <XCircleIcon className="h-6 w-6 text-red-500" />}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    // Exam stats view removed

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <div className="mb-6">
                <Link to={`/admin/class/${classId}`} className="text-blue-600 hover:underline">&larr; Back to Class Details</Link>
            </div>
            <h1 className="text-3xl font-bold mb-2">Class Statistics</h1>
            <h2 className="text-xl font-semibold text-gray-700 mb-6">{className}</h2>

            {/* Toggle */}
            <div className="mb-4 flex gap-2">
                <button onClick={()=>setView('student')} className={`px-3 py-2 rounded ${view==='student'?'bg-blue-600 text-white':'bg-white border'}`}>Student Data</button>
                <button onClick={()=>setView('quiz')} className={`px-3 py-2 rounded ${view==='quiz'?'bg-blue-600 text-white':'bg-white border'}`}>Quiz Data</button>
            </div>

            {view === 'student' && (
                <>
                    <div className="mb-6 bg-white p-4 rounded-lg shadow-md">
                        <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-2">
                            Select Start Date:
                        </label>
                        <input
                            type="date"
                            id="start-date"
                            value={startDate}
                            onChange={handleDateChange}
                            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    {loading && <p className="text-center">Loading...</p>}
                    {error && <p className="text-red-500 text-center">{error}</p>}
                    {!loading && !error && renderStudentStats()}
                </>
            )}

            {view === 'quiz' && (
                <div className="bg-white p-4 rounded-lg shadow-md">
                    {quizLoading && <div className="text-gray-600">Loading...</div>}
                    {quizError && <div className="text-red-600">{quizError}</div>}
                    {!quizLoading && !quizError && (
                        <table className="min-w-full text-left">
                            <thead className="border-b bg-gray-50">
                                <tr>
                                    <th className="p-3 font-semibold">Quiz Name</th>
                                    <th className="p-3 font-semibold">Status</th>
                                    <th className="p-3 font-semibold">Published At</th>
                                    <th className="p-3 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quizzes.map(q => (
                                    <tr key={q._id} className="border-b hover:bg-gray-50">
                                        <td className="p-3">{q.name}</td>
                                        <td className="p-3">{q.status}</td>
                                        <td className="p-3">{q.publish_at ? String(q.publish_at).replace('T',' ').replace('Z','') : '-'}</td>
                                        <td className="p-3">
                                            <button onClick={async()=>{
                                                setSelectedQuiz(q);
                                                setAttemptsLoading(true); setAttempts([]);
                                                try {
                                                    const token = localStorage.getItem('token');
                                                    const r = await fetch(`/api/admin/classes/${classId}/quizzes/${q._id}/attempts`, { headers: { 'Authorization': `Bearer ${token}` } });
                                                    const data = await r.json().catch(()=>[]);
                                                    setAttempts(Array.isArray(data) ? data : []);
                                                } finally { setAttemptsLoading(false); }
                                            }} className="text-indigo-600 underline">View Details</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {selectedQuiz && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl p-6 relative">
                        <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={()=>{setSelectedQuiz(null); setAttempts([]);}}>×</button>
                        <h3 className="text-xl font-bold mb-2 text-gray-800">{selectedQuiz.name} - Attempt Details</h3>
                        {attemptsLoading ? (
                            <div className="text-gray-600">Loading...</div>
                        ) : (
                            <>
                                {/* Overview: completion and average */}
                                {(() => {
                                    const totalStudents = classStudents.length;
                                    const byUser = new Map();
                                    attempts.forEach(a => {
                                        const u = a.user?.username || '';
                                        if (!u) return;
                                        if (!byUser.has(u)) byUser.set(u, []);
                                        byUser.get(u).push(a);
                                    });
                                    const completedUsernames = new Set(byUser.keys());
                                    const completedCount = completedUsernames.size;
                                    const completionRate = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;
                                    // first-attempt average percentage
                                    let sumPct = 0; let n = 0;
                                    completedUsernames.forEach(u => {
                                        const lst = byUser.get(u) || [];
                                        const first = lst.slice().sort((a,b)=> new Date(a.ts) - new Date(b.ts))[0];
                                        if (first && first.total_score > 0) { sumPct += (first.score / Math.max(1, first.total_score)) * 100; n += 1; }
                                    });
                                    const avgPct = n > 0 ? (sumPct / n) : 0;
                                    // Completed users rows (first attempt) and not-completed list
                                    const completedRows = [];
                                    completedUsernames.forEach(u => {
                                        const lst = byUser.get(u) || [];
                                        const first = lst.slice().sort((a,b)=> new Date(a.ts) - new Date(b.ts))[0];
                                        const name = classStudents.find(s => s.username === u)?.nickname || u;
                                        completedRows.push({ username: u, name, first });
                                    });
                                    completedRows.sort((a,b) => a.name.localeCompare(b.name));
                                    const notCompleted = classStudents.filter(s => !completedUsernames.has(s.username));
                                    return (
                                        <div className="mb-4">
                                            <div className="flex flex-wrap gap-3 mb-3">
                                                <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 text-sm">Completion: {completionRate}% ({completedCount}/{totalStudents})</span>
                                                <span className="px-2 py-1 rounded bg-green-50 text-green-800 border border-green-200 text-sm">Average Score: {avgPct.toFixed(1)}%</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="border rounded">
                                                    <div className="px-3 py-2 bg-gray-50 text-gray-800 font-semibold">Completed ({completedRows.length})</div>
                                                    <div className="max-h-64 overflow-y-auto">
                                                        <table className="min-w-full text-left text-sm">
                                                            <thead className="bg-white sticky top-0"><tr><th className="p-2">Student</th><th className="p-2">First Attempt Score</th><th className="p-2">Actions</th></tr></thead>
                                                            <tbody className="divide-y">
                                                                {completedRows.map(row => (
                                                                    <tr key={row.username}>
                                                                        <td className="p-2">{row.name}</td>
                                                                        <td className="p-2">{row.first?.score}/{Math.max(1, row.first?.total_score||0)}</td>
                                                                        <td className="p-2"><button className="text-indigo-600 underline" onClick={()=>openAttemptDetail(row.first?._id)}>View Attempt</button></td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                <div className="border rounded">
                                                    <div className="px-3 py-2 bg-gray-50 text-gray-800 font-semibold">Not Completed ({notCompleted.length})</div>
                                                    <div className="max-h-64 overflow-y-auto">
                                                        <ul className="divide-y">
                                                            {notCompleted.map(s => (
                                                                <li key={s._id} className="p-2">{s.nickname || s.username}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* All attempts table */}
                            <div className="max-h-[50vh] overflow-y-auto border rounded">
                                    {attempts.length === 0 ? (
                                        <div className="p-3 text-gray-600">No attempts</div>
                                    ) : (
                                        <table className="min-w-full text-left text-sm">
                                            <thead className="bg-gray-50 text-gray-600 sticky top-0">
                                                <tr>
                                                    <th className="p-2">Student</th>
                                                    <th className="p-2">Score</th>
                                                    <th className="p-2">Time</th>
                                                    <th className="p-2">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {attempts.map(a => (
                                                    <tr key={a._id}>
                                                        <td className="p-2">{a.user?.nickname || a.user?.username || '-'}</td>
                                                        <td className="p-2">{a.score}/{Math.max(1, a.total_score)}</td>
                                                        <td className="p-2">{String(a.ts).replace('T',' ').replace('Z','')}</td>
                                                        <td className="p-2"><button className="text-indigo-600 underline" onClick={()=>openAttemptDetail(a._id)}>View Attempt</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </>
                        )}
                        <div className="mt-4 text-right">
                            <button className="px-4 py-2 bg-gray-200 rounded" onClick={()=>{setSelectedQuiz(null); setAttempts([]);}}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Attempt detail modal */}
            {attemptDetailId && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] p-4 relative">
                        <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={()=>{setAttemptDetailId(null); setAttemptDetail(null);}}>×</button>
                        <h3 className="text-xl font-bold mb-3 text-gray-800">Attempt Details</h3>
                        {attemptDetailError && (<div className="text-red-600">{attemptDetailError}</div>)}
                        <div className="w-full h-[calc(90vh-110px)] border rounded overflow-hidden">
            <iframe title="review-attempt" src={`/review/attempt/${attemptDetailId}?adminView=1`} className="w-full h-full"></iframe>
          </div>
        </div>
      </div>
    )}

        </div>
    );
};

export default ClassStatsPage;
