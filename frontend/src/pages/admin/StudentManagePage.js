import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';

const api = async (method, url, body=null) => {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, ...(body?{'Content-Type':'application/json'}:{}) },
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
};

const StudentManagePage = () => {
  const { studentId } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search || '');
  const back = params.get('back');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('tier_3');
  const [assignText, setAssignText] = useState('');
  const [saving, setSaving] = useState(false);
  const [openDates, setOpenDates] = useState(new Set());
  // Remove "Create Secret Wordbook" entry; keep pick-from-box only
  const [showPickModal, setShowPickModal] = useState(false);
  const [boxes, setBoxes] = useState([]);
  const [goal, setGoal] = useState(0);
  // Daily detail modal (replaces inline expand)
  const [showDayDetailOf, setShowDayDetailOf] = useState('');
  const [dayDetail, setDayDetail] = useState(null);
  // Sentence reordering error log: toggle time/word columns (hidden by default)
  const [showReorderMeta, setShowReorderMeta] = useState(false);
  // Quiz stats and attempts
  const [quizStats, setQuizStats] = useState(null);
  const [quizSummaries, setQuizSummaries] = useState([]); // flat results list
  const [expandedQuiz, setExpandedQuiz] = useState(null);
  const [quizAttempts, setQuizAttempts] = useState({}); // quiz_id -> attempts[]
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  // Attempt details modal
  const [showAttemptModal, setShowAttemptModal] = useState(false);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [attemptError, setAttemptError] = useState('');
  const [attemptDetail, setAttemptDetail] = useState(null);
  // iframe attempt viewer
  const [attemptIframeId, setAttemptIframeId] = useState(null);
  const toggleOpen = (d) => {
    setOpenDates(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  };

  const openDayDetail = (dateStr) => {
    try {
      setShowDayDetailOf(dateStr);
      const list = (info?.study_by_day || []);
      const found = list.find(d => d.date === dateStr) || null;
      setDayDetail(found);
    } catch (e) {
      setDayDetail(null);
    }
  };

  const closeDayDetail = () => {
    setShowDayDetailOf('');
    setDayDetail(null);
  };


  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await api('GET', `/api/admin/students/${encodeURIComponent(studentId)}/overview`);
      setInfo(data);
      setTier(data?.tier || 'tier_3');
      setGoal(Number(data?.learning_goal || 0));
      // Load quiz stats and summaries for this student
      const username = data?.student?.username;
      if (username) {
        try {
          setQuizLoading(true); setQuizError('');
          const stats = await api('GET', `/api/stats/users/${encodeURIComponent(username)}`);
          setQuizStats(stats || null);
          const results = await api('GET', `/api/results?username=${encodeURIComponent(username)}`);
          setQuizSummaries(Array.isArray(results) ? results : []);
        } catch (e) {
          setQuizError(e.message || 'Failed to load quiz data');
        } finally {
          setQuizLoading(false);
        }
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable react-hooks/exhaustive-deps */ }, [studentId]);

  const saveTier = async () => {
    try { setSaving(true); await api('PUT', `/api/admin/students/${studentId}/tier`, { tier }); await load(); }
    catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const assignWords = async () => {
    const words = assignText.split(/[\s,\n]+/).map(s=>s.trim()).filter(Boolean);
    if (words.length === 0) { alert('Please enter words'); return; }
    try { setSaving(true); await api('POST', `/api/admin/students/${studentId}/assign`, { words }); setAssignText(''); await load(); }
    catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const saveGoal = async () => {
    try {
      setSaving(true);
      const n = Math.max(0, Math.min(500, parseInt(goal, 10) || 0));
      await api('PUT', `/api/admin/students/${studentId}/learning-goal`, { goal: n });
      await load();
      alert('Learning goal updated');
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  // 已移除创建秘制词库的功能

  const openPick = async () => {
    try {
      setShowPickModal(true);
      const data = await api('GET', '/api/admin/secret-boxes');
      setBoxes(Array.isArray(data) ? data : []);
    } catch (e) { alert(e.message); }
  };

  const pickFromBox = async (boxId) => {
    try {
      setSaving(true);
      await api('POST', `/api/admin/students/${studentId}/secret-wordbook-from-box`, { box_id: boxId });
      setShowPickModal(false);
      await load();
      alert('Set from wordbook box');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const toggleQuizExpand = async (quizId) => {
    if (expandedQuiz === quizId) {
      setExpandedQuiz(null);
      return;
    }
    setExpandedQuiz(quizId);
    if (!quizAttempts[quizId]) {
      try {
        setQuizLoading(true); setQuizError('');
        const username = info?.student?.username;
        const attempts = await api('GET', `/api/results/quizzes/${encodeURIComponent(quizId)}?username=${encodeURIComponent(username)}`);
        setQuizAttempts(prev => ({ ...prev, [quizId]: Array.isArray(attempts) ? attempts : [] }));
      } catch (e) {
        setQuizError(e.message || 'Failed to load quiz details');
      } finally {
        setQuizLoading(false);
      }
    }
  };

  const openAttemptIframe = (resultId) => {
    setAttemptIframeId(resultId);
  };
  const closeAttemptIframe = () => setAttemptIframeId(null);

  const openAttemptModal = async (resultId) => {
    try {
      setAttemptLoading(true); setAttemptError(''); setShowAttemptModal(true); setAttemptDetail(null);
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/results/${encodeURIComponent(resultId)}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || 'Failed to load details');
      setAttemptDetail(j);
    } catch (e) {
      setAttemptError(e.message || 'Failed to load details');
    } finally {
      setAttemptLoading(false);
    }
  };

  const closeAttemptModal = () => {
    setShowAttemptModal(false);
    setAttemptDetail(null);
    setAttemptError('');
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  const student = info?.student || {};

  return (
    <div>
    <div className="space-y-6">
      
      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">Student Management</h2>
              {back && (
                <Link to={back} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Back to Class</Link>
              )}
            </div>
            <div className="mt-1 text-gray-600">{student.username} {student.nickname ? `(${student.nickname})` : ''}</div>
          </div>
          {info?.secret_wordbook_title && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Secret Wordbook:</span>
              <span className="px-2 py-1 rounded bg-purple-50 text-purple-700 border border-purple-200 text-sm">{info.secret_wordbook_title}</span>
              <button onClick={openPick} className="px-3 py-2 bg-purple-600 text-white rounded">Edit</button>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">Learning Level</label>
          <select value={tier} onChange={e=>setTier(e.target.value)} className="p-2 border rounded bg-gray-50">
            <option value="tier_3">Needs Support</option>
            <option value="tier_2">Stable Growth</option>
            <option value="tier_1">High Performer</option>
          </select>
          <button onClick={saveTier} disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Save</button>
          <div className="h-6 w-px bg-gray-200 mx-2" />
          <label className="text-sm text-gray-600">Daily Learning Goal</label>
          <input type="number" min={0} max={500} value={goal} onChange={e=>setGoal(e.target.value)} className="w-24 p-2 border rounded bg-gray-50" />
          <button onClick={saveGoal} disabled={saving} className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50">Update Goal</button>
          {!info?.secret_wordbook_title && (
            <>
              <button onClick={openPick} className="px-3 py-2 bg-purple-50 text-purple-700 rounded border border-purple-200">Choose from Secret Wordbook Box</button>
              <a href="/admin/secret-box" className="px-3 py-2 bg-gray-100 text-gray-700 rounded border">Manage Secret Wordbook Box</a>
            </>
          )}
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <h4 className="font-bold text-gray-900 mb-2">Quiz Performance</h4>
        {quizLoading && <div className="text-gray-600">Loading...</div>}
        {quizError && <div className="text-red-600">{quizError}</div>}
        {quizStats && (
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="px-3 py-2 rounded bg-blue-50 text-blue-800 border border-blue-200">Completion: {quizStats.completion_rate}%</div>
            <div className="px-3 py-2 rounded bg-green-50 text-green-800 border border-green-200">Average Score: {quizStats.average_score}%</div>
            <div className="px-3 py-2 rounded bg-purple-50 text-purple-800 border border-purple-200">Pass Rate: {quizStats.pass_rate}%</div>
            <div className="px-3 py-2 rounded bg-gray-50 text-gray-800 border">Current Streak: {quizStats.streak}</div>
          </div>
        )}
        {/* Group results by quiz */}
        {quizSummaries && quizSummaries.length > 0 ? (
          <div className="border rounded">
            <table className="min-w-full text-left">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-2">Quiz Name</th>
                  <th className="p-2">Quiz ID</th>
                  <th className="p-2">First Score</th>
                  <th className="p-2">Latest Score</th>
                  <th className="p-2">Attempts</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.values(quizSummaries.reduce((acc, item) => {
                  const qid = item.quiz_id || 'unknown';
                  const existing = acc[qid];
                  // Track latest by ts and count
                  const ts = new Date(item.ts || 0).getTime();
                  if (!existing) {
                    const pct = item.total_score > 0 ? Math.round((item.score / Math.max(1, item.total_score)) * 100) : 0;
                    acc[qid] = { ...item, attempts: 1, latestTs: ts, latestPct: pct, firstTs: ts, firstScore: item.score, firstTotal: item.total_score, firstPct: pct };
                  } else {
                    existing.attempts += 1;
                    if (ts > existing.latestTs) {
                      existing.latestTs = ts;
                      existing.score = item.score;
                      existing.total_score = item.total_score;
                      existing.quiz_name = item.quiz_name || existing.quiz_name;
                      existing.latestPct = item.total_score > 0 ? Math.round((item.score / Math.max(1, item.total_score)) * 100) : 0;
                    }
                    if (ts < existing.firstTs) {
                      existing.firstTs = ts;
                      existing.firstScore = item.score;
                      existing.firstTotal = item.total_score;
                      existing.firstPct = item.total_score > 0 ? Math.round((item.score / Math.max(1, item.total_score)) * 100) : 0;
                    }
                  }
                  return acc;
                }, {})).map((row) => (
                  <React.Fragment key={row.quiz_id}>
                    <tr key={row.quiz_id}>
                      <td className="p-2">{row.quiz_name || 'Quiz'}</td>
                      <td className="p-2 text-gray-600">{row.quiz_id}</td>
                      <td className="p-2">{row.firstScore}/{Math.max(1, row.firstTotal)} ({typeof row.firstPct==='number'?row.firstPct:0}%)</td>
                      <td className="p-2">{row.score}/{Math.max(1, row.total_score)} ({typeof row.latestPct==='number'?row.latestPct:0}%)</td>
                      <td className="p-2">{row.attempts}</td>
                      <td className="p-2">
                        <button className="px-3 py-1 bg-indigo-600 text-white rounded text-sm" onClick={()=>toggleQuizExpand(row.quiz_id)}>
                          {expandedQuiz === row.quiz_id ? 'Collapse' : 'Expand'}
                        </button>
                      </td>
                    </tr>
                    {expandedQuiz === row.quiz_id && (
                      <tr>
                        <td colSpan={5} className="bg-gray-50">
                          <div className="p-3">
                            {(quizAttempts[row.quiz_id] || []).length === 0 ? (
                              <div className="text-gray-600">No detailed records</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-sm">
                                  <thead className="bg-white">
                                    <tr>
                                      <th className="p-2">Time</th>
                                      <th className="p-2">Score</th>
                                      <th className="p-2">Passed</th>
                                      <th className="p-2">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {(quizAttempts[row.quiz_id] || []).map(a => (
                                      <tr key={a.id}>
                                        <td className="p-2 text-gray-600 whitespace-nowrap">{a.ts?.replace('T',' ').replace('Z','')}</td>
                                        <td className="p-2">{a.score}/{Math.max(1, a.total_score)} ({a.total_score>0?Math.round((a.score/Math.max(1,a.total_score))*100):0}%)</td>
                                        <td className="p-2">{a.passed ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">Passed</span> : <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">Failed</span>}</td>
                                        <td className="p-2">
                                          <button onClick={()=>openAttemptIframe(a.id)} className="text-indigo-600 hover:underline">View Details</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-600">No quiz records</div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-3">Assign Words</h3>
          <textarea value={assignText} onChange={e=>setAssignText(e.target.value)} placeholder="Separate by comma, space, or newline. e.g., apple, banana, ..." className="w-full p-3 border rounded min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="mt-3 text-right">
          <button onClick={assignWords} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">Assign</button>
          </div>
        </div>

      <div>
        <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
          <h4 className="font-bold text-gray-900 mb-2">Assigned Words To Learn ({info?.tbm_teacher_assigned?.length || 0})</h4>
          <div className="flex flex-wrap gap-2">
            {(info?.tbm_teacher_assigned || []).map((w, i)=>(<span key={i} className="px-2 py-1 bg-gray-50 border rounded text-sm">{w}</span>))}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <h4 className="font-bold text-gray-900 mb-2">Words To Review Today ({info?.review_today?.length || 0})</h4>
        <div className="flex flex-wrap gap-2">
          {(info?.review_today || []).map((w, i)=>(<span key={i} className="px-2 py-1 bg-gray-50 border rounded text-sm">{w}</span>))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <h4 className="font-bold text-gray-900 mb-2">Daily Study Log (last 30 days)</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-gray-50 text-gray-600">
              <tr><th className="p-2">Date</th><th className="p-2">Learned</th><th className="p-2">Reviewed</th><th className="p-2">Review Done</th><th className="p-2">Actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {[...(info?.study_by_day || [])].reverse().map((d)=> (
                <React.Fragment key={d.date}>
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="p-2">{d.date}</td>
                    <td className="p-2">{d.learned}</td>
                    <td className="p-2">{d.reviewed}</td>
                    <td className="p-2">
                      {d.review_done ? (
                        <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">Done</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">Pending</span>
                      )}
                    </td>
                    <td className="p-2">
                      <button onClick={()=>openDayDetail(d.date)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">View Details</button>
                    </td>
                  </tr>
                  
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-gray-900">Sentence Reordering Error Log ({Array.isArray(info?.reordering_error_logs) ? info.reordering_error_logs.length : 0})</h4>
          <button
            onClick={() => setShowReorderMeta(v => !v)}
            className="px-3 py-1.5 rounded text-sm border bg-gray-50 hover:bg-gray-100 text-gray-700"
          >
            {showReorderMeta ? 'Hide Time/Word' : 'Show Time/Word'}
          </button>
        </div>
        {Array.isArray(info?.reordering_error_logs) && info.reordering_error_logs.length > 0 ? (
          <div className="max-h-80 overflow-y-auto border rounded">
            <table className={`min-w-full text-left ${!showReorderMeta ? 'table-fixed' : ''}`}>
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {showReorderMeta && (<th className="p-2">Time</th>)}
                  {showReorderMeta && (<th className="p-2">Word</th>)}
                  <th className={`p-2 ${!showReorderMeta ? 'w-1/3' : ''}`}>Student Answer</th>
                  <th className={`p-2 ${!showReorderMeta ? 'w-1/3' : ''}`}>Correct Answer</th>
                  <th className={`p-2 ${!showReorderMeta ? 'w-1/3' : ''}`}>Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {info.reordering_error_logs.map((e, idx) => (
                  <tr key={idx} className="align-top">
                    {showReorderMeta && (<td className="p-2 text-xs text-gray-500 whitespace-nowrap">{e.ts}</td>)}
                    {showReorderMeta && (<td className="p-2 text-sm text-gray-800">{e.word}</td>)}
                    <td className={`p-2 text-sm text-gray-800 whitespace-pre-wrap ${!showReorderMeta ? 'w-1/3' : ''}`}>{(e.user_answer || '').replaceAll('_',' ')}</td>
                    <td className={`p-2 text-sm text-blue-700 whitespace-pre-wrap ${!showReorderMeta ? 'w-1/3' : ''}`}>{(e.correct_answer || '').replaceAll('_',' ')}</td>
                    <td className={`p-2 text-sm text-gray-700 whitespace-pre-wrap ${!showReorderMeta ? 'w-1/3' : 'max-w-[400px]'}`}>{e.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500">No records</div>
        )}
      </div>
    </div>
    {/* Remove create-secret modal; keep pick-from-box only */}
    {showPickModal && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative">
          <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={()=>setShowPickModal(false)}>×</button>
          <h3 className="text-xl font-bold mb-2 text-gray-800">Choose from Secret Wordbook Box</h3>
          <div className="max-h-80 overflow-y-auto">
            {boxes.length === 0 && <div className="text-gray-600">No wordbooks. Please create one first.</div>}
            {boxes.map(b => (
              <div key={b._id} className="flex items-center justify-between border-b py-2">
                <div>
                  <div className="font-medium text-gray-900">{b.title}</div>
                  <div className="text-xs text-gray-600">{b.count} words</div>
                </div>
                <button className="px-3 py-1.5 bg-purple-600 text-white rounded" onClick={()=>pickFromBox(b._id)}>Select</button>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right">
            <button className="px-4 py-2 bg-gray-200 rounded" onClick={()=>setShowPickModal(false)}>Close</button>
          </div>
        </div>
      </div>
    )}
    {Boolean(showDayDetailOf) && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 relative">
          <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={closeDayDetail}>×</button>
          <h3 className="text-xl font-bold mb-4 text-gray-800">{showDayDetailOf} Study Details</h3>
          {!dayDetail ? (
            <div className="text-gray-600">No data</div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div>
                <div className="text-sm text-gray-700 mb-2">Learned in Secret Wordbook ({Array.isArray(dayDetail.secret_learned_words) ? dayDetail.secret_learned_words.length : 0})</div>
                {Array.isArray(dayDetail.secret_learned_words) && dayDetail.secret_learned_words.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dayDetail.secret_learned_words.map((w, i) => (
                      <span key={`sl-${i}`} className="px-2 py-1 bg-gray-50 border rounded text-sm">{w}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">(None)</div>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-700 mb-2">Other Learned Words ({Array.isArray(dayDetail.other_learned_words) ? dayDetail.other_learned_words.length : 0})</div>
                {Array.isArray(dayDetail.other_learned_words) && dayDetail.other_learned_words.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dayDetail.other_learned_words.map((w, i) => (
                      <span key={`ol-${i}`} className="px-2 py-1 bg-gray-50 border rounded text-sm">{w}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">(None)</div>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-700 mb-2">Words Reviewed Today ({Array.isArray(dayDetail.reviewed_words) ? dayDetail.reviewed_words.length : 0})</div>
                {Array.isArray(dayDetail.reviewed_words) && dayDetail.reviewed_words.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dayDetail.reviewed_words.map((w, i) => (
                      <span key={`rv-${i}`} className="px-2 py-1 bg-gray-50 border rounded text-sm">{w}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">(None)</div>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 text-right">
            <button className="px-4 py-2 bg-gray-200 rounded" onClick={closeDayDetail}>Close</button>
          </div>
        </div>
      </div>
    )}
    {attemptIframeId && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] p-4 relative">
          <button className="absolute top-3 right-3 text-2xl leading-none text-gray-500 hover:text-gray-800" onClick={closeAttemptIframe}>×</button>
          <h3 className="text-xl font-bold mb-3 text-gray-800">Quiz Details</h3>
          <div className="w-full h-[calc(90vh-110px)] border rounded overflow-hidden">
            <iframe title="review-attempt" src={`/review/attempt/${attemptIframeId}?adminView=1`} className="w-full h-full"></iframe>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default StudentManagePage;
