import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AcademicCapIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import LearningOrderModal from '../components/LearningOrderModal';
import ManageTrackedWordbooksModal from '../components/ManageTrackedWordbooksModal';
import { useLocation } from 'react-router-dom';

const StudentDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [wordbooks, setWordbooks] = useState([]);
  const [selectedWordbookId, setSelectedWordbookId] = useState('');
  const [learnCount, setLearnCount] = useState(10);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedTier, setSelectedTier] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewWords, setPreviewWords] = useState([]);
  const [previewError, setPreviewError] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewMeta, setPreviewMeta] = useState({ wbId: '', count: 0 });
  const navigate = useNavigate();
  const location = useLocation();
  // Create/manage wordbooks moved to /student/my-wordbooks
  const [streak, setStreak] = useState(0);
  const [showTbm, setShowTbm] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showTracked, setShowTracked] = useState(false);
  const [todayLearned, setTodayLearned] = useState(0);
  const [hasSecret, setHasSecret] = useState(false); // kept for compatibility; prefer summary.has_secret when available
  const useSecretMode = (summary?.has_secret === true && summary?.secret_wordbook_completed !== true);
  const displayLearned = useSecretMode
    ? (typeof summary?.secret_today_learned === 'number' ? summary.secret_today_learned : 0)
    : todayLearned;
  const remainingLearn = Math.max(0, (summary?.learning_goal || 0) - (Number.isFinite(displayLearned) ? displayLearned : 0));
  // UI 兜底：若今日学习数已达成目标，则视为 Achieved（避免后端标志延迟导致误判）
  const uiGoalMet = useMemo(() => {
    const goal = Number(summary?.learning_goal || 0);
    const learned = (typeof summary?.secret_today_learned === 'number')
      ? Number(summary.secret_today_learned)
      : Number(todayLearned || 0);
    if (summary?.goal_today_met === true) return true;
    if (goal <= 0) return false;
    return learned >= goal;
  }, [summary, todayLearned]);
  const [wordsToReview, setWordsToReview] = useState([]);
  const [priorityWordbookId, setPriorityWordbookId] = useState('');
  const [priorityWords, setPriorityWords] = useState([]);
  const [priorityTitle, setPriorityTitle] = useState('');
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [quickCount, setQuickCount] = useState(0);
  const [quickWbId, setQuickWbId] = useState('');
  const [quickAssigning, setQuickAssigning] = useState(false);
  const [quickTier, setQuickTier] = useState('');
  const [quickMax, setQuickMax] = useState(0);
  const [quickMaxLoading, setQuickMaxLoading] = useState(false);
  const [showReviewQuick, setShowReviewQuick] = useState(false);
  const [reviewTier, setReviewTier] = useState('');
  // Learn teacher-assigned words now
  const [showTeacherLearn, setShowTeacherLearn] = useState(false);
  const [teacherLearnTier, setTeacherLearnTier] = useState('');
  const [invites, setInvites] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  // To-Do: pending quizzes
  const [quizLoading, setQuizLoading] = useState(true);
  const [quizError, setQuizError] = useState('');
  const [pendingQuizzes, setPendingQuizzes] = useState([]);

  // One-click learning top-up flow
  const EXISTING_KEY = '__existing__';
  const [topUpVisible, setTopUpVisible] = useState(false);
  const [topUpTarget, setTopUpTarget] = useState(0);
  const [topUpNeeded, setTopUpNeeded] = useState(0);
  const [topUpWords, setTopUpWords] = useState([]);
  const [topUpPlan, setTopUpPlan] = useState({}); // wbId -> planned words
  const [topUpSelectedWbId, setTopUpSelectedWbId] = useState('');
  const [initialAssignWbId, setInitialAssignWbId] = useState('');
  const [oneClickTier, setOneClickTier] = useState('');
  const [topUpAssigning, setTopUpAssigning] = useState(false); // confirming start
  const [topUpLoading, setTopUpLoading] = useState(false); // previewing to fill
  // One-click learning: backend cached plan
  const [oneClickPlannedWords, setOneClickPlannedWords] = useState([]);
  const [oneClickPlanTitle, setOneClickPlanTitle] = useState('');
  const [oneClickPlanCounts, setOneClickPlanCounts] = useState({ base_count: 0, supplement_count: 0 });
  const [showOneClickPreview, setShowOneClickPreview] = useState(false);

  // Tier options aligned with WordPracticePage
  const availableTiers = useMemo(() => {
    const studentTier = summary?.tier || 'tier_3';
    if (studentTier === 'tier_1') return ['tier_1'];
    if (studentTier === 'tier_2') return ['tier_2', 'tier_1'];
    return ['tier_3', 'tier_2', 'tier_1'];
  }, [summary?.tier]);
  const labelByTier = { tier_3: 'Normal', tier_2: 'Advanced', tier_1: 'Challenge' };

  // Ensure selected quick/one-click tier always within allowed range
  useEffect(() => {
    if (showQuick) {
      const allowed = availableTiers;
      if (!allowed.includes(quickTier)) setQuickTier(allowed[0] || 'tier_3');
    }
  }, [showQuick, availableTiers, quickTier]);
  useEffect(() => {
    if (topUpVisible) {
      const allowed = availableTiers;
      if (!allowed.includes(oneClickTier)) setOneClickTier(allowed[0] || 'tier_3');
    }
  }, [topUpVisible, availableTiers, oneClickTier]);

  // Initialize teacher-learn tier when opening modal
  useEffect(() => {
    if (showTeacherLearn) {
      const allowed = availableTiers;
      if (!allowed.includes(teacherLearnTier)) setTeacherLearnTier(allowed[0] || 'tier_3');
    }
  }, [showTeacherLearn, availableTiers, teacherLearnTier]);

  const loadPriorityWords = async (wbId) => {
    setPriorityWords([]);
    if (!wbId) return;
    try {
      setPriorityLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/student/wordbooks/${wbId}/tbm-words`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(()=>({}));
      if (res.ok) {
        setPriorityWords(Array.isArray(data.words) ? data.words : []);
        setPriorityTitle(data?.wordbook_title || '');
      } else {
        setPriorityTitle('');
      }
    } catch (_) {
      // ignore
    } finally {
      setPriorityLoading(false);
    }
  };
  

  const fetchSummary = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/student/dashboard-summary', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const s = await res.json();
      setSummary(s);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const beijingTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
      setCurrentTime(new Date(beijingTime).toLocaleString());
    }, 1000);

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        // Trigger backend to refresh today's stats before reading them
        try { await fetch('/api/student/stats', { headers: { Authorization: `Bearer ${token}` } }); } catch (_) {}
        const [summaryRes, wordbooksRes, statsRes, trackedRes, reviewRes, inviteRes, compactRes] = await Promise.all([
          fetch('/api/student/dashboard-summary', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/student/wordbooks', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/student/study-stats?days=30', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/student/tracked-wordbooks', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/student/review-words', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/student/invitations', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/student/stats', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        if (!summaryRes.ok) throw new Error('Failed to fetch learning data');
        const s = await summaryRes.json();
        setSummary(s);
        if (wordbooksRes.ok) {
          const list = await wordbooksRes.json();
          let books = Array.isArray(list) ? list : [];
          if (trackedRes.ok) {
            const tr = await trackedRes.json().catch(()=>({ ids: [] }));
            const ids = Array.isArray(tr.ids) ? tr.ids : [];
            if (ids.length > 0) {
              // Always include own private wordbooks, plus tracked public books
              const priv = books.filter(b => (b && b.accessibility === 'private'));
              const tracked = books.filter(b => ids.includes(b._id));
              const merged = {};
              for (const b of [...priv, ...tracked]) { if (b && b._id) merged[b._id] = b; }
              books = Object.values(merged);
            }
          }
          setWordbooks(books);
          if (!selectedWordbookId && books.length > 0) setSelectedWordbookId(books[0]._id);
        }
        if (inviteRes && inviteRes.ok) {
          const list = await inviteRes.json().catch(()=>[]);
          setInvites(Array.isArray(list) ? list : []);
        }
        // 取消 preflight/onboarding：不再弹首登引导
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setStreak(stats?.goal_streak_days || 0);
          const arr = Array.isArray(stats?.by_day) ? stats.by_day : [];
          const today = arr.length > 0 ? arr[arr.length - 1] : null;
          setTodayLearned(today?.learned || 0);
          // prefer summary.has_secret; keep this as a fallback signal
          setHasSecret(Boolean(stats?.has_secret));
        }
        if (compactRes && compactRes.ok) {
          const comp = await compactRes.json().catch(()=>null);
          if (comp) setLiveStats(comp);
        }
        if (reviewRes.ok) {
          const reviewWords = await reviewRes.json().catch(() => []);
          setWordsToReview(Array.isArray(reviewWords) ? reviewWords : []);
        }
        // Initialize tier select from profile
        if (!selectedTier && s?.tier) setSelectedTier(s.tier);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    return () => clearInterval(timer);
  }, []);

  // 返回页面或标签页可见时自动刷新 summary 与 stats，保证 Today’s Status 及时更新
  useEffect(() => {
    const handleRefresh = async () => {
      try {
        const token = localStorage.getItem('token');
        // Fetch compact stats (also triggers backend recompute) and update UI
        try {
          const cr = await fetch('/api/student/stats', { headers: { Authorization: `Bearer ${token}` } });
          if (cr.ok) { const c = await cr.json(); setLiveStats(c); }
        } catch (_) {}
        await fetchSummary();
        const statsRes = await fetch('/api/student/study-stats?days=30', { headers: { Authorization: `Bearer ${token}` } });
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setStreak(stats?.goal_streak_days || 0);
          const arr = Array.isArray(stats?.by_day) ? stats.by_day : [];
          const today = arr.length > 0 ? arr[arr.length - 1] : null;
          setTodayLearned(today?.learned || 0);
          setHasSecret(Boolean(stats?.has_secret));
        }
      } catch (_) {}
    };
    const onVisibility = () => { if (!document.hidden) handleRefresh(); };
    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Load pending quizzes for To-Do list
  useEffect(() => {
    const loadToDo = async () => {
      setQuizLoading(true); setQuizError('');
      try {
        const token = localStorage.getItem('token');
        const profRes = await fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } });
        const profile = await profRes.json();
        if (!profRes.ok) throw new Error(profile?.message || 'Failed to load profile');
        const username = profile?.username;
        if (!username) throw new Error('Missing username');
        const progressRes = await fetch(`/api/progress/${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${token}` } });
        const progress = await progressRes.json();
        if (!progressRes.ok) throw new Error(progress?.error || 'Failed to load pending quizzes');
        const pend = (Array.isArray(progress) ? progress : []).filter(q => q.status === 'pending' && (!q.publish_status || q.publish_status === 'published'));
        setPendingQuizzes(pend);
      } catch (e) {
        setQuizError(e?.message || 'Failed to load pending quizzes');
        setPendingQuizzes([]);
      } finally {
        setQuizLoading(false);
      }
    };
    loadToDo();
  }, []);

  // Support opening quick-assign modal via URL param: /student/dashboard?openQuick=1
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || window.location.search || '');
      const openQuick = params.get('openQuick');
      if (openQuick === '1') {
        const firstId = selectedWordbookId || (wordbooks[0]?._id || '');
        setQuickWbId(firstId);
        setQuickCount(0);
        setQuickTier(selectedTier || summary?.tier || 'tier_3');
        setShowQuick(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, wordbooks, selectedWordbookId]);

  // 统计学生已掌握/待掌握词，用于过滤（需在任何 early return 之前声明 hooks）
  const excludeWordsSet = useMemo(() => {
    const set = new Set();
    const tbm = summary?.to_be_mastered || [];
    const wm = summary?.words_mastered || [];
    tbm.forEach(x => { const w = (typeof x === 'string' ? x : x.word); if (w) set.add(w); });
    wm.forEach(x => { const w = (typeof x === 'string' ? x : x.word); if (w) set.add(w); });
    return set;
  }, [summary]);

  // 当用户更换“补齐词库”时：重新生成一次学习计划并缓存（仅预览，不写入）
  useEffect(() => {
    const rebuildPlan = async () => {
      if (!topUpVisible) return;
      if (!topUpSelectedWbId) return;
      const count = topUpTarget || 0;
      if (count <= 0) return;
      try {
        setTopUpLoading(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/student/learning-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ wordbook_id: topUpSelectedWbId, count })
        });
        const data = await res.json().catch(()=>({}));
        if (res.ok) {
          const words = Array.isArray(data?.words) ? data.words : [];
          setOneClickPlannedWords(words);
          setOneClickPlanTitle(data?.wordbook_title || 'Selected Wordbook');
          setOneClickPlanCounts({ base_count: Number(data?.base_count||0), supplement_count: Number(data?.supplement_count||0) });
        }
      } catch (_) {
        // ignore
      } finally {
        setTopUpLoading(false);
      }
    };
    rebuildPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topUpSelectedWbId]);

  // 计算“立即学习”的最大可学数量：待掌握数量 + 所选词库可补齐数量
  useEffect(() => {
    const calcQuickMax = async () => {
      if (!showQuick) return;
      // 待掌握（老师优先 + 其它）总量
      const teacherConnected = summary?.has_teacher === true;
      let baseAvailable = 0;
      if (teacherConnected) {
        const tbm = Array.isArray(summary?.to_be_mastered) ? summary.to_be_mastered : [];
        const tbmWords = tbm.map(x => (typeof x === 'string' ? x : x.word)).filter(Boolean);
        const teacherSet = new Set((summary?.teacher_assigned || []).map(w => w));
        const teacherFirst = []; const others = [];
        for (const w of tbmWords) { if (teacherSet.has(w)) teacherFirst.push(w); else others.push(w); }
        baseAvailable = teacherFirst.length + others.length;
      }

      // 词库可补齐数量：使用 preview count 大数来估计
      let supAvailable = 0;
      if (quickWbId) {
        try {
          setQuickMaxLoading(true);
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/student/wordbooks/${quickWbId}/preview?count=9999`, { headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json().catch(()=>({count:0}));
          if (res.ok) supAvailable = Number(data?.count || 0);
        } catch (_) {
          supAvailable = 0;
        } finally {
          setQuickMaxLoading(false);
        }
      }
      setQuickMax(Math.max(0, baseAvailable + supAvailable));
    };
    calcQuickMax();
  }, [showQuick, quickWbId, summary]);

  if (loading) return <div className="text-center p-10">Loading...</div>;
  if (error) return (
    <div className="text-center p-10">
      <div className="text-red-600 font-semibold">Error: {error}</div>
      {String(error || '').toLowerCase().includes('failed to fetch learning data') && (
        <div className="mt-4 inline-flex flex-col items-center gap-3 bg-yellow-50 text-yellow-900 border border-yellow-200 rounded p-4">
          <div className="text-sm">
            It’s likely your last login was too long ago. Please log in again to refresh your session.
          </div>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      )}
    </div>
  );
  const hasTeacher = summary?.has_teacher === true;

  const handleStartLearning = async () => {
    if (!selectedWordbookId) { alert('Please select a wordbook'); return; }
    const n = parseInt(learnCount, 10) || 0;
    if (n <= 0) { alert('Please enter the number of words to learn'); return; }
    setIsAssigning(true);
    try {
      // 后端统一组装学习计划：待掌握优先 + 指定词库补齐
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/student/learning-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wordbook_id: selectedWordbookId, count: n })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to generate learning plan');
      const words = Array.isArray(data?.words) ? data.words.slice(0, n) : [];
      if (words.length === 0) { alert('This wordbook has no available new words'); return; }
      // 缓存一次预览结果（可选）
      setPreviewWords(words);
      setPreviewTitle(data?.wordbook_title || 'Selected Wordbook');
      setPreviewMeta({ wbId: selectedWordbookId, count: n });

      const tier = selectedTier || summary?.tier || 'tier_3';
      const params = new URLSearchParams();
      params.set('mode', 'learn');
      params.set('tier', tier);
      params.set('autostart', '1');
      params.set('focus_words', words.join(','));
      navigate(`/student/word-practice?${params.toString()}`);
    } catch (e) {
      alert(e.message || 'Operation failed');
    } finally {
      setIsAssigning(false);
    }
  };

  // 一键学习：先使用“待掌握列表”的现有词作为基础（不写入），不足部分让用户选择词库补齐；确认开始时再写入
  const handleOneClickLearn = async () => {
    try {
      const useSecret = (summary?.has_secret === true && summary?.secret_wordbook_completed !== true);
      const usedLearned = useSecret
        ? (typeof summary?.secret_today_learned === 'number' ? summary.secret_today_learned : 0)
        : (todayLearned || 0);
      const remaining = Math.max(0, (summary?.learning_goal || 0) - usedLearned);
      const tbmCount = (summary?.has_teacher === true && Array.isArray(summary?.to_be_mastered)) ? summary.to_be_mastered.length : 0;
      const desired = tbmCount + remaining;
      if (desired <= 0) { alert('No available learning plan: To-be-mastered is empty and today’s goal is met.'); return; }
      setIsAssigning(true);
      // Select default supplement wordbook: prefer "Custom Wordbook" (private)
      let defaultTopWb = '';
      try {
        const secret = (wordbooks || []).find(b => b && b.title === 'Custom Wordbook' && b.accessibility === 'private');
        defaultTopWb = secret?._id || (wordbooks[0]?._id || '');
      } catch(_) {
        defaultTopWb = (wordbooks[0]?._id || '');
      }
      if (!defaultTopWb && Array.isArray(wordbooks) && wordbooks.length === 0) {
        try { const t = localStorage.getItem('token'); const r = await fetch('/api/student/wordbooks', { headers: { Authorization: `Bearer ${t}` } }); if (r.ok) { const list = await r.json(); if (Array.isArray(list) && list.length>0) { defaultTopWb = list[0]._id || ''; setWordbooks(list); } } } catch(_) {}
      }
      setTopUpTarget(desired);
      setTopUpSelectedWbId(defaultTopWb);
      // 调用后端统一计划一次并缓存
      if (defaultTopWb && desired > 0) {
        try {
          setTopUpLoading(true);
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/student/learning-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ wordbook_id: defaultTopWb, count: desired })
          });
          const data = await res.json().catch(()=>({}));
          if (res.ok) {
            setOneClickPlannedWords(Array.isArray(data?.words) ? data.words : []);
            setOneClickPlanTitle(data?.wordbook_title || 'Selected Wordbook');
            setOneClickPlanCounts({ base_count: Number(data?.base_count||0), supplement_count: Number(data?.supplement_count||0) });
          } else {
            setOneClickPlannedWords([]);
            setOneClickPlanCounts({ base_count: 0, supplement_count: 0 });
          }
        } catch(_) {
          setOneClickPlannedWords([]);
          setOneClickPlanCounts({ base_count: 0, supplement_count: 0 });
        } finally {
          setTopUpLoading(false);
        }
      }
      setOneClickTier(selectedTier || summary?.tier || 'tier_3');
      setInitialAssignWbId(EXISTING_KEY);
      setShowOneClickPreview(false);
      // 现在再展示弹窗，已具备补齐预览，避免“先显示后计算”的体验
      setTopUpVisible(true);
    } catch (e) {
      alert(e.message || 'One-click learning failed');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleTopUpPreview = async (wbIdParam = null, countOverride = null) => {
    const wbId = wbIdParam || topUpSelectedWbId;
    if (!wbId) { alert('Please select a wordbook'); return; }
    try {
      setTopUpLoading(true);
      const token = localStorage.getItem('token');
      const needCount = (countOverride ?? topUpNeeded) || 0;
      if (needCount <= 0) { setTopUpLoading(false); return; }
      const res = await fetch(`/api/student/wordbooks/${wbId}/preview?count=${encodeURIComponent(needCount)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(payload?.message || 'Top-up failed');
      const newWordsRaw = Array.isArray(payload?.words) ? payload.words.slice(0, needCount) : [];
      const existingSet = new Set(topUpWords);
      const newWords = newWordsRaw.filter(w => !existingSet.has(w));
      const combined = Array.from(new Set([...(topUpWords||[]), ...newWords]));
      const stillNeed = Math.max(0, (topUpTarget || 0) - combined.length);
      setTopUpWords(combined);
      setTopUpNeeded(stillNeed);
      setTopUpPlan(prev => ({ ...prev, [wbId]: [...new Set([...(prev[wbId] || []), ...newWords])] }));
    } catch (e) {
      alert(e.message || 'Top-up failed');
    } finally {
      setTopUpLoading(false);
    }
  };

  // moved above early returns

  const handleTopUpStartNow = async () => {
    const planned = Array.isArray(oneClickPlannedWords) ? oneClickPlannedWords : [];
    if (planned.length === 0) { alert('No learnable words'); return; }
    try {
      setTopUpAssigning(true);
      const tier = oneClickTier || selectedTier || summary?.tier || 'tier_3';
      const params = new URLSearchParams();
      params.set('mode', 'learn');
      params.set('tier', tier);
      params.set('autostart', '1');
      if (planned.length < (topUpTarget || 0)) {
        // 告知用户本次实际可学习数
        try { alert(`Only ${planned.length} learnable words found; starting with available count.`); } catch {}
      }
      params.set('focus_words', planned.join(','));
      setTopUpVisible(false);
      navigate(`/student/word-practice?${params.toString()}`);
    } catch (e) {
      alert(e.message || 'Failed to start learning');
    } finally {
      setTopUpAssigning(false);
    }
  };

  // 一键复习：弹出难度选择
  const handleOneClickReview = () => {
    setReviewTier(selectedTier || summary?.tier || 'tier_3');
    setShowReviewQuick(true);
  };

  const handlePreview = async () => {
    if (!selectedWordbookId) { alert('Please select a wordbook'); return; }
    const n = parseInt(learnCount, 10) || 0;
    if (n <= 0) { alert('Please enter the number of words to learn'); return; }
    setIsPreviewing(true);
    setPreviewError('');
    setPreviewWords([]);
    setPreviewTitle('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/student/wordbooks/${selectedWordbookId}/preview?count=${encodeURIComponent(n)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Preview failed');
      setPreviewWords(Array.isArray(data.words) ? data.words : []);
      setPreviewTitle(data?.wordbook_title || 'Selected Wordbook');
      setPreviewMeta({ wbId: selectedWordbookId, count: n });
    } catch (e) {
      setPreviewError(e.message || 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <div>
      {/* Hero header */}
      <div className="rounded-2xl p-8 mb-8 bg-gradient-to-r from-indigo-50 via-white to-purple-50 border">
        {Array.isArray(invites) && invites.length > 0 && (
          <div className="mb-4 p-3 rounded-lg border bg-yellow-50 text-yellow-800">
            <div className="font-semibold mb-2">You have {invites.length} invitations from teachers</div>
            <div className="space-y-2">
              {invites.map(inv => (
                <div key={inv._id} className="flex items-center justify-between p-2 rounded bg-white">
                  <div>Teacher: {inv.teacher?.username || '—'} {inv.teacher?.nickname ? `(${inv.teacher.nickname})` : ''}</div>
                  <div className="flex gap-2">
                    <button onClick={async ()=>{ try { const t = localStorage.getItem('token'); await fetch(`/api/student/invitations/${inv._id}/accept`, { method:'PUT', headers:{ 'Authorization': `Bearer ${t}`}}); setInvites(prev=>prev.filter(x=>x._id!==inv._id)); } catch {} }} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Accept</button>
                    <button onClick={async ()=>{ try { const t = localStorage.getItem('token'); await fetch(`/api/student/invitations/${inv._id}/reject`, { method:'PUT', headers:{ 'Authorization': `Bearer ${t}`}}); setInvites(prev=>prev.filter(x=>x._id!==inv._id)); } catch {} }} className="px-3 py-1 bg-gray-500 text-white rounded text-sm">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
            <p className="mt-1 text-gray-600">Welcome back! Quickly view today’s goals and review status here.</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Current time (Asia/Shanghai)</div>
            <div className="text-lg font-semibold text-gray-800">{currentTime}</div>
          </div>
        </div>

        {/* Status panel */}
        <div className="mt-6 bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-gray-50">
              <div className="text-sm text-gray-600">Today’s Status</div>
              <div className={`inline-flex mt-2 items-center px-2 py-0.5 rounded-full text-xs font-semibold ${(liveStats?.goal_today_met ?? uiGoalMet) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {(liveStats?.goal_today_met ?? uiGoalMet) ? 'Achieved' : 'Not achieved'}
              </div>
            </div>
            <div className="p-4 rounded-lg border bg-gray-50">
              <div className="text-sm text-gray-600">Max Streak (days)</div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{liveStats?.max_streak_days ?? 0}</div>
            </div>
            <div className="p-4 rounded-lg border bg-gray-50">
              <div className="text-sm text-gray-600">Current streak</div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{liveStats?.current_streak_days ?? streak}</div>
            </div>
          </div>
        </div>

        {/* To-Do: Quizzes to complete + one-click actions */}
        <div className="mt-4 bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">To-Do</h3>
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
                  <a href={`/quiz/${q.quiz_id}`} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Start Quiz</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">You have completed all available quizzes. Great job!</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {(() => {
              const goal = (liveStats?.today_goal ?? summary?.learning_goal ?? 0);
              const useSecret = (summary?.has_secret === true && summary?.secret_wordbook_completed !== true);
              const learned = useSecret
                ? (typeof summary?.secret_today_learned === 'number' ? summary.secret_today_learned : 0)
                : (Number.isFinite(todayLearned) ? todayLearned : (liveStats?.today_learned ?? 0));
              const learnRemaining = Math.max(0, Number(goal) - Number(learned || 0));
              const learnDone = learnRemaining <= 0;
              const learnedToday = learned;
              return (
                <button
                  onClick={learnDone ? undefined : handleOneClickLearn}
                  disabled={isAssigning || learnDone}
                  className={`px-4 py-2 text-white rounded bg-green-600 hover:bg-green-700 disabled:bg-green-600`}
                >
                  {learnDone ? `Completed today's learning — learned ${learnedToday} words` : `One-click Learn (${learnRemaining} left)`}
                </button>
              );
            })()}
            {(() => {
              const reviewRemaining = Array.isArray(wordsToReview) ? wordsToReview.length : 0;
              const reviewDone = reviewRemaining <= 0;
              return (
                <button
                  onClick={reviewDone ? undefined : handleOneClickReview}
                  disabled={reviewDone}
                  className={`px-4 py-2 text-white rounded bg-green-600 hover:bg-green-700 disabled:bg-green-600`}
                >
                  {reviewDone ? 'All reviews done 🎉' : `One-click Review (${reviewRemaining} left)`}
                </button>
              );
            })()}
          </div>
        </div>

        {/* (moved TBM section above; this placeholder removed) */}

        {/* Quick actions (card) */}
        <div className="mt-6 bg-white border rounded-xl shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-gray-600">Quick Actions</div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setQuickWbId(selectedWordbookId || (wordbooks[0]?._id || '')); setQuickCount(0); setQuickTier(selectedTier || summary?.tier || 'tier_3'); setShowQuick(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                <BoltIcon className="w-5 h-5" /> Learn Now
              </button>
              <button
                onClick={() => setShowOrder(true)}
                className="px-4 py-2 bg-white border rounded-md hover:bg-gray-50"
              >
                Adjust learning order
              </button>
              <button
                onClick={() => setShowTracked(true)}
                className="px-4 py-2 bg-white border rounded-md hover:bg-gray-50"
              >
                Manage learning wordbooks
              </button>
              {hasTeacher && (
                <button
                  onClick={() => setShowTbm(v => !v)}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200"
                >
                  {showTbm ? 'Hide To-Be-Mastered' : 'Show To-Be-Mastered'}
                </button>
              )}
            </div>
          </div>
        </div>
        {hasTeacher && showTbm && Array.isArray(summary?.to_be_mastered) && summary.to_be_mastered.length > 0 && (
          <div className="mt-6 border rounded-xl bg-white shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-800">Priority wordbook</span>
              <select
                value={priorityWordbookId}
                onChange={(e)=>{ const v = e.target.value; setPriorityWordbookId(v); loadPriorityWords(v); }}
                className="p-2 border rounded bg-white text-sm min-w-[180px]"
              >
                <option value="">None</option>
                {wordbooks.map(wb => (
                  <option key={wb._id} value={wb._id}>{wb.title}</option>
                ))}
              </select>
              {priorityWordbookId && (
                <span className="text-xs text-gray-500">{priorityLoading ? 'Searching...' : `Matched ${priorityWords.length}`}</span>
              )}
            </div>
            {(() => {
              const tbm = summary?.to_be_mastered || [];
              const tset = new Set((summary?.teacher_assigned || []).map(w => w));
              let teacherList = tbm.filter(e => (e?.source === 'teacher') || tset.has(e?.word));
              let selfList = tbm.filter(e => !((e?.source === 'teacher') || tset.has(e?.word)));

              // Build priority top list (regardless of teacher/self)
              const pset = new Set(priorityWords);
              const topList = (priorityWordbookId ? tbm.filter(e => pset.has(e?.word)) : []);

              // Remove topList items from group lists to avoid duplicates
              const topSet = new Set(topList.map(x => x.word));
              teacherList = teacherList.filter(e => !topSet.has(e?.word));
              selfList = selfList.filter(e => !topSet.has(e?.word));

              // Limit lengths for display
              const topListLimited = topList.slice(0, 200);
              teacherList = teacherList.slice(0, 200);
              selfList = selfList.slice(0, 200);
              return (
                <>
                  {priorityWordbookId && topListLimited.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-emerald-800 mb-2">Priority wordbook: {priorityTitle || 'Selected'} ({topListLimited.length})</div>
                      <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {topListLimited.map((item, idx) => (
                          <li key={`p-${idx}`} className="px-2 py-1 bg-white border rounded text-gray-800 flex items-center justify-between">
                            <span>{item.word}</span>
                            {item.due_date && <span className="text-xs text-gray-500 ml-2">{item.due_date}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {teacherList.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-indigo-800 mb-2">Assigned ({teacherList.length})</div>
                      <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {teacherList.map((item, idx) => (
                          <li key={`t-${idx}`} className="px-2 py-1 bg-white border rounded text-gray-800 flex items-center justify-between">
                            <span>{item.word}</span>
                            {item.due_date && <span className="text-xs text-gray-500 ml-2">{item.due_date}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selfList.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-2">Self-study ({selfList.length})</div>
                      <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {selfList.map((item, idx) => (
                          <li key={`s-${idx}`} className="px-2 py-1 bg-white border rounded text-gray-800 flex items-center justify-between">
                            <span>{item.word}</span>
                            {item.due_date && <span className="text-xs text-gray-500 ml-2">{item.due_date}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {Array.isArray(summary?.teacher_assigned) && summary.teacher_assigned.length > 0 && (
          <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded">
            <div className="font-bold text-indigo-800 mb-2">Teacher-assigned words (priority)</div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-indigo-700">Total {summary.teacher_assigned.length}</div>
              <button
                onClick={() => setShowTeacherLearn(true)}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Learn them now
              </button>
            </div>
            {showTeacherLearn && (
              <div className="mt-3 p-3 bg-white border rounded">
                <div className="text-sm font-medium text-gray-800 mb-2">Choose difficulty</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={teacherLearnTier}
                    onChange={(e)=>setTeacherLearnTier(e.target.value)}
                    className="p-2 border rounded bg-gray-50 text-sm"
                  >
                    {availableTiers.map(t => (
                      <option key={t} value={t}>{labelByTier[t] || t}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      try {
                        const words = (Array.isArray(summary?.teacher_assigned) ? summary.teacher_assigned : []).filter(Boolean);
                        if (words.length === 0) { alert('No teacher-assigned words to learn'); return; }
                        const params = new URLSearchParams();
                        params.set('mode', 'learn');
                        params.set('tier', teacherLearnTier || (availableTiers[0] || 'tier_3'));
                        params.set('autostart', '1');
                        params.set('focus_words', words.join(','));
                        navigate(`/student/word-practice?${params.toString()}`);
                      } catch (e) {
                        alert('Failed to start learning');
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Start learning
                  </button>
                  <button onClick={()=>setShowTeacherLearn(false)} className="px-3 py-1.5 text-sm bg-gray-100 border rounded hover:bg-gray-200">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 针对性学习面板已取消，相关入口移动至上方“学习面板”的快速操作 */}
      {showOrder && (
        <LearningOrderModal
          isOpen={showOrder}
          onClose={async (saved) => { setShowOrder(false); if (saved) { await fetchSummary(); } }}
          wordbooks={wordbooks}
        />
      )}
      {showTracked && (
        <ManageTrackedWordbooksModal
          isOpen={showTracked}
          onClose={async (saved)=>{
            setShowTracked(false);
            if (saved) {
              // 变更追踪词库后，立即刷新词库列表以生效
              try {
                const token = localStorage.getItem('token');
                const [wordbooksRes, trackedRes] = await Promise.all([
                  fetch('/api/student/wordbooks', { headers: { Authorization: `Bearer ${token}` } }),
                  fetch('/api/student/tracked-wordbooks', { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (wordbooksRes.ok) {
                  const list = await wordbooksRes.json();
                  let books = Array.isArray(list) ? list : [];
                  if (trackedRes.ok) {
                    const tr = await trackedRes.json().catch(()=>({ ids: [] }));
                    const ids = Array.isArray(tr.ids) ? tr.ids : [];
                    if (ids.length > 0) {
                      // 与初始加载保持一致：保留私有词库 + 追踪的公开词库
                      const priv = books.filter(b => (b && b.accessibility === 'private'));
                      const tracked = books.filter(b => ids.includes(b._id));
                      const merged = {};
                      for (const b of [...priv, ...tracked]) { if (b && b._id) merged[b._id] = b; }
                      books = Object.values(merged);
                    }
                  }
                  setWordbooks(books);
                  if (!selectedWordbookId && books.length > 0) setSelectedWordbookId(books[0]._id);
                }
              } catch (_) {}
            }
          }}
        />
      )}

      {/* onboarding 移除 */}

      {showQuick && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900">Start Learning</h3>
            <p className="text-gray-600 mt-1 text-sm">Choose wordbook, count, and difficulty.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Choose wordbook (for supplement)</label>
                <select value={quickWbId} onChange={(e)=>setQuickWbId(e.target.value)} className="w-full p-3 border rounded-md bg-gray-50">
                  {wordbooks.map(wb => (
                    <option key={wb._id} value={wb._id}>{wb.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Count (max: {quickMaxLoading ? 'Calculating…' : quickMax})</label>
                <input type="number" min="0" max={Math.max(0, quickMax)} value={Number.isFinite(quickCount)?quickCount:0} onChange={(e)=> {
                  const v = parseInt(e.target.value||'0',10);
                  const clamped = Math.max(0, Math.min(Number.isFinite(quickMax)?quickMax:200, Number.isFinite(v)?v:0));
                  setQuickCount(clamped);
                }} className="w-full p-3 border rounded-md bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Choose difficulty</label>
                <select value={quickTier} onChange={(e)=>setQuickTier(e.target.value)} className="w-full p-3 border rounded-md bg-gray-50">
                  {availableTiers.map(t => (
                    <option key={t} value={t}>{labelByTier[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <button
                  type="button"
                  onClick={async ()=>{
                    try {
                      const n = parseInt(quickCount, 10) || 0;
                      if (n <= 0) { alert('Please enter the number of words to learn'); return; }
                      if (!quickWbId) { alert('Please select a wordbook'); return; }
                      setIsPreviewing(true);
                      setPreviewError('');
                      setPreviewWords([]);
                      setPreviewTitle('');
                      const token = localStorage.getItem('token');
                      const res = await fetch(`/api/student/learning-plan`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ wordbook_id: quickWbId, count: n })
                      });
                      const data = await res.json().catch(()=>({}));
                      if (!res.ok) throw new Error(data?.message || 'Preview failed');
                      setPreviewWords(Array.isArray(data?.words) ? data.words : []);
                      setPreviewTitle(data?.wordbook_title || 'Selected Wordbook');
                      setPreviewMeta({ wbId: quickWbId, count: n });
                    } catch (e) {
                      setPreviewError(e?.message || 'Preview failed');
                    } finally {
                      setIsPreviewing(false);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border rounded hover:bg-gray-50"
                >
                  Preview words to learn
                </button>
              </div>
              {(() => {
                const match = previewWords && previewWords.length > 0 && previewMeta.wbId === quickWbId && Number(previewMeta.count) === Number(quickCount || 0);
                if (!match) return null;
                return (
                  <div className="p-3 bg-gray-50 border rounded max-h-40 overflow-y-auto text-sm text-gray-800">
                    {previewWords.join(', ')}
                  </div>
                );
              })()}
              {(() => {
                // Summary: TBM first then supplement from selected wordbook (only if connected to teacher)
                const teacherConnected = summary?.has_teacher === true;
                let baseCount = 0;
                if (teacherConnected) {
                  const tbm = Array.isArray(summary?.to_be_mastered) ? summary.to_be_mastered : [];
                  const tbmWords = tbm.map(x => (typeof x === 'string' ? x : x.word)).filter(Boolean);
                  const teacherSet = new Set((summary?.teacher_assigned || []).map(w => w));
                  const teacherFirst = []; const others = [];
                  for (const w of tbmWords) { if (teacherSet.has(w)) teacherFirst.push(w); else others.push(w); }
                  const baseOrdered = [...teacherFirst, ...others];
                  baseCount = Math.min(quickCount || 0, baseOrdered.length);
                }
                const supCount = Math.max(0, (quickCount || 0) - baseCount);
                const wb = wordbooks.find(w => w._id === quickWbId);
                return (
                  <div className="text-xs text-gray-600 bg-gray-50 border rounded p-2">
                    {teacherConnected && baseCount > 0
                      ? `You will learn ${baseCount} to-be-mastered words${supCount>0 ? `, and ${supCount} from ${wb?.title || 'Selected Wordbook'}` : ''}`
                      : `You will learn ${supCount} from ${wb?.title || 'Selected Wordbook'}`}
                  </div>
                );
              })()}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={()=>setShowQuick(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button
                disabled={quickAssigning || (()=>{ const tbm=Array.isArray(summary?.to_be_mastered)?summary.to_be_mastered:[]; const tw=tbm.map(x=> (typeof x==='string'?x:x.word)).filter(Boolean); const ts=new Set((summary?.teacher_assigned||[]).map(w=>w)); const tf=[]; const ot=[]; for (const w of tw){ if (ts.has(w)) tf.push(w); else ot.push(w);} const bo=[...tf,...ot]; const supNeeded=Math.max(0,(quickCount||0)-bo.length); return (supNeeded>0 && !quickWbId); })()}
                onClick={async ()=>{
                  const n = parseInt(quickCount, 10) || 0;
                  if (n <= 0) { alert('Please enter the number of words to learn'); return; }
                  try {
                    setQuickAssigning(true);
                    // 1) 先从待掌握列表取 n 个（老师布置优先）
                    const tbm = Array.isArray(summary?.to_be_mastered) ? summary.to_be_mastered : [];
                    const tbmWords = tbm.map(x => (typeof x === 'string' ? x : x.word)).filter(Boolean);
                    const teacherSet = new Set((summary?.teacher_assigned || []).map(w => w));
                    const teacherFirst = [];
                    const others = [];
                    for (const w of tbmWords) { if (teacherSet.has(w)) teacherFirst.push(w); else others.push(w); }
                    const baseOrdered = [...teacherFirst, ...others];
                    const got = baseOrdered.slice(0, n);
                    let combined = [...got];
                    const need = Math.max(0, n - got.length);
                    // 2) 若不够，交由后端统一生成计划（待掌握优先 + 指定词库补齐）
                    if (need > 0) {
                      if (!quickWbId) { alert('Please select a wordbook'); return; }
                      const token = localStorage.getItem('token');
                      const res = await fetch(`/api/student/learning-plan`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ wordbook_id: quickWbId, count: n })
                      });
                      const payload = await res.json().catch(()=>({}));
                      if (!res.ok) throw new Error(payload?.message || 'Failed to generate learning plan');
                      const planned = Array.isArray(payload?.words) ? payload.words.slice(0, n) : [];
                      // 计划已包含待掌握优先逻辑，这里直接使用计划覆盖组合
                      combined = planned;
                      if (planned.length < n) {
                        try { alert(`Exceeds available new words. You can learn at most ${planned.length} this time. Starting with available count.`); } catch {}
                      }
                      if (combined.length === 0) { alert('This wordbook has no available new words'); return; }
                    }
                    // 3) 跳转开练
                    const params = new URLSearchParams();
                    params.set('mode', 'learn');
                    params.set('tier', quickTier || summary?.tier || 'tier_3');
                    params.set('autostart', '1');
                    params.set('focus_words', combined.join(','));
                    setShowQuick(false);
                    navigate(`/student/word-practice?${params.toString()}`);
                  } catch (e) {
                    alert(e?.message || 'Operation failed');
                  } finally {
                    setQuickAssigning(false);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-gray-300"
              >{quickAssigning ? 'Preparing…' : 'Start learning'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 页面外预览已移除；预览仅在弹窗内显示 */}

      {showReviewQuick && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900">One-click Review</h3>
            <p className="text-gray-600 mt-1 text-sm">Choose difficulty to start review.</p>
            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-1">Choose difficulty</label>
              <select value={reviewTier} onChange={(e)=>setReviewTier(e.target.value)} className="w-full p-3 border rounded-md bg-gray-50">
                <option value="tier_3">Normal</option>
                <option value="tier_2">Hard</option>
                <option value="tier_1">Advanced</option>
              </select>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={()=>setShowReviewQuick(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button onClick={()=>{ const params = new URLSearchParams(); params.set('mode','review'); params.set('tier', reviewTier || summary?.tier || 'tier_3'); params.set('autostart','1'); setShowReviewQuick(false); navigate(`/student/word-practice?${params.toString()}`); }} className="px-4 py-2 bg-purple-600 text-white rounded">Start Review</button>
            </div>
          </div>
        </div>
      )}

      {topUpVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-xl font-bold text-gray-900">Start Learning</h3>
            <p className="text-gray-600 mt-2 text-sm">
              You will learn {oneClickPlanCounts.base_count} to-be-mastered words{ oneClickPlanCounts.supplement_count>0 ? `, and ${oneClickPlanCounts.supplement_count} from ${(wordbooks.find(w=>w._id===topUpSelectedWbId)?.title) || oneClickPlanTitle || 'Selected Wordbook'}` : ''}.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Choose difficulty</label>
                <select
                  value={oneClickTier}
                  onChange={(e)=>setOneClickTier(e.target.value)}
                  className="w-full p-3 border rounded-md bg-gray-50"
                >
                  {availableTiers.map(t => (
                    <option key={t} value={t}>{labelByTier[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Choose wordbook to supplement (if needed)</label>
                <select
                  value={topUpSelectedWbId}
                  onChange={(e)=>setTopUpSelectedWbId(e.target.value)}
                  className="w-full p-3 border rounded-md bg-gray-50"
                >
                  {wordbooks.map(wb => (
                    <option key={wb._id} value={wb._id}>{wb.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => { setShowOneClickPreview(true); }}
                  className="w-full px-3 py-2 text-sm bg-white border rounded hover:bg-gray-50"
                  disabled={topUpLoading || (oneClickPlannedWords||[]).length===0}
                >
                  Preview words to learn
                </button>
                {topUpLoading && <div className="text-xs text-gray-500 mt-1">Preparing plan…</div>}
              </div>
              {showOneClickPreview && Array.isArray(oneClickPlannedWords) && oneClickPlannedWords.length > 0 && (
                <div className="p-3 bg-gray-50 border rounded max-h-40 overflow-y-auto text-sm text-gray-800">
                  {oneClickPlannedWords.join(', ')}
                </div>
              )}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3">
              <button onClick={handleTopUpStartNow} disabled={topUpAssigning} className="px-4 py-2 bg-green-600 text-white rounded-md">{topUpAssigning ? 'Starting…' : 'Confirm start'}</button>
            </div>
            <button onClick={()=>setTopUpVisible(false)} className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700">Cancel and go back</button>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentDashboard;
