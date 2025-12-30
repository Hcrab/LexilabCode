import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiStar, FiCalendar, FiX } from 'react-icons/fi';

// --- Color Logic ---
const getReviewColor = (reviewTimes) => {
  const times = reviewTimes || 0;
  const colors = [
    { text: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-400' }, // 0
    { text: 'text-lime-700', bg: 'bg-lime-100', border: 'border-lime-400' },     // 1
    { text: 'text-green-700', bg: 'bg-green-100', border: 'border-green-400' },   // 2
    { text: 'text-teal-700', bg: 'bg-teal-100', border: 'border-teal-400' },     // 3
    { text: 'text-cyan-700', bg: 'bg-cyan-100', border: 'border-cyan-400' },     // 4
    { text: 'text-sky-700', bg: 'bg-sky-100', border: 'border-sky-400' },       // 5
    { text: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-400' },     // 6
    { text: 'text-indigo-700', bg: 'bg-indigo-100', border: 'border-indigo-400' }, // 7
    { text: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-400' }, // 8+
  ];
  return colors[Math.min(times, 8)];
};

// --- Modal Component ---
const ReviewModal = ({ date, words, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">{date} Review Plan</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
          <FiX size={24} />
        </button>
      </div>
      <ul className="space-y-2 max-h-80 overflow-y-auto">
        {words.map(word => (
          <li key={word} className="p-2 bg-gray-50 rounded-md text-gray-700">{word}</li>
        ))}
      </ul>
    </div>
  </div>
);

const WordOverviewPage = () => {
  const [masteredWords, setMasteredWords] = useState([]);
  const [wordbooks, setWordbooks] = useState([]);
  const [wbProgress, setWbProgress] = useState([]);
  const [trackedIds, setTrackedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('date_desc');
  const [modalData, setModalData] = useState(null); // { date, words }

  useEffect(() => {
    const fetchMasteredWords = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Please log in first');
        const response = await fetch('/api/student/dashboard-summary', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to fetch mastered words');
        const data = await response.json();
        setMasteredWords(data.words_mastered || []);
        // Fetch visible wordbooks for this student
        const [wbr, trr] = await Promise.all([
          fetch('/api/student/wordbooks', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/student/tracked-wordbooks', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        const wblist = wbr.ok ? (await wbr.json()) : [];
        const tr = trr.ok ? (await trr.json()) : { ids: [] };
        const allBooks = Array.isArray(wblist) ? wblist : [];
        const trIds = Array.isArray(tr.ids) ? tr.ids : [];
        setTrackedIds(trIds);
        const displayBooks = trIds.length > 0 ? allBooks.filter(wb => trIds.includes(wb._id)) : allBooks;
        setWordbooks(displayBooks);
        // Fetch per-wordbook progress
        const progresses = [];
        for (const wb of displayBooks) {
          try {
            const pr = await fetch(`/api/student/wordbooks/${wb._id}/progress`, { headers: { 'Authorization': `Bearer ${token}` } });
            const pj = await pr.json().catch(()=>({}));
            if (pr.ok) progresses.push(pj);
          } catch {}
        }
        setWbProgress(progresses);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMasteredWords();
  }, []);

  const reviewForecast = useMemo(() => {
    const forecast = {};
    masteredWords.forEach(word => {
      if (word.review_date) {
        word.review_date.forEach(date => {
          if (!forecast[date]) {
            forecast[date] = [];
          }
          forecast[date].push(word.word);
        });
      }
    });
    return Object.entries(forecast)
      .map(([date, words]) => ({ date, count: words.length, words }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [masteredWords]);

  const handleSort = (column) => {
    const directions = {
      word: sortOrder === 'word_asc' ? 'word_desc' : 'word_asc',
      date: sortOrder === 'date_asc' ? 'date_desc' : 'date_asc',
      review: sortOrder === 'review_asc' ? 'review_desc' : 'review_asc',
    };
    setSortOrder(directions[column]);
  };

  const filteredAndSortedWords = masteredWords
    .filter(word => word.word.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      switch (sortOrder) {
        case 'word_asc': return a.word.localeCompare(b.word);
        case 'word_desc': return b.word.localeCompare(a.word);
        case 'date_asc': return new Date(a.date_mastered) - new Date(b.date_mastered);
        case 'date_desc': return new Date(b.date_mastered) - new Date(a.date_mastered);
        case 'review_asc': return (a.review_times || 0) - (b.review_times || 0);
        case 'review_desc': return (b.review_times || 0) - (a.review_times || 0);
        default: return 0;
      }
    });

  if (loading) return <div className="text-center p-10">Loading...</div>;
  if (error) return <div className="text-center p-10 text-red-500">Error: {error}</div>;

  // 书签功能已移除

  return (
    <div className="container mx-auto p-6">
      {modalData && <ReviewModal date={modalData.date} words={modalData.words} onClose={() => setModalData(null)} />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 bg-white shadow-lg rounded-xl p-6 mb-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Overall Progress ({trackedIds.length > 0 ? 'Tracked Wordbooks' : 'All Wordbooks'})</h2>
          {(() => {
            const total = wbProgress.reduce((acc, p) => acc + (p.total_count || 0), 0);
            const learned = wbProgress.reduce((acc, p) => acc + (p.learned_count || 0), 0);
            const reviewTotal = wbProgress.reduce((acc, p) => acc + (p.review_total_units || 0), 0);
            const reviewDone = wbProgress.reduce((acc, p) => acc + (p.review_done_units || 0), 0);
            const learnPct = total > 0 ? Math.round((learned / total) * 100) : 0;
            const reviewPct = reviewTotal > 0 ? Math.round((reviewDone / reviewTotal) * 100) : 0;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-sm text-gray-700"><span>Learning Progress</span><span>{learnPct}%</span></div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-2 bg-blue-500" style={{ width: `${learnPct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Completed {learned}/{total}</div>
                </div>
                <div>
                  <div className="flex justify-between text-sm text-gray-700"><span>Review Progress</span><span>{reviewPct}%</span></div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-2 bg-green-500" style={{ width: `${reviewPct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Done {reviewDone}/{reviewTotal} times</div>
                </div>
              </div>
            );
          })()}
        </div>
        {/* Wordbook Progress Panel */}
        <div className="lg:col-span-3 bg-white shadow-lg rounded-xl p-6 mb-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Wordbook Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wbProgress.length > 0 ? wbProgress.map(p => {
              const learnPct = p.total_count > 0 ? Math.round((p.learned_count / p.total_count) * 100) : 0;
              const reviewPct = p.review_total_units > 0 ? Math.round((p.review_done_units / p.review_total_units) * 100) : 0;
              return (
                <div key={p.wordbook_id} className="p-4 border rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">{p.title || 'Untitled wordbook'}</div>
                  <div className="text-xs text-gray-500 mb-2">Total {p.total_count} words</div>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-700"><span>Learning Progress</span><span>{learnPct}%</span></div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-2 bg-blue-500" style={{ width: `${learnPct}%` }} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Learned {p.learned_count}/{p.total_count}</div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-gray-700"><span>Review Progress</span><span>{reviewPct}%</span></div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-2 bg-green-500" style={{ width: `${reviewPct}%` }} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Done {p.review_done_units}/{p.review_total_units} times</div>
                  </div>
                </div>
              );
            }) : (
              <p className="text-gray-500">No wordbook data.</p>
            )}
          </div>
        </div>
        {/* Main Content */}
        <div className="lg:col-span-2 bg-white shadow-lg rounded-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Words I Mastered</h1>
          <div className="relative mb-6">
            <FiSearch className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search words..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('word')}>
                    Word {sortOrder.includes('word') && (sortOrder === 'word_asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('review')}>
                    Review progress {sortOrder.includes('review') && (sortOrder === 'review_asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next review
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('date')}>
                    Mastered date {sortOrder.includes('date') && (sortOrder === 'date_asc' ? '▲' : '▼')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAndSortedWords.map(word => {
                  const reviewTimes = word.review_times || 0;
                  const colors = getReviewColor(reviewTimes);
                  const nextReviewDate = word.review_date && word.review_date.length > 0 ? word.review_date[0] : 'Done';
                  return (
                    <tr key={word.word} className={`${colors.bg} hover:brightness-95 transition-all`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {/* 书签操作已移除 */}
                          <span className={`${colors.text} font-bold`}>{word.word}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-3">
                            <div className={`${colors.bg.replace('100', '400')} h-2 rounded-full`} style={{ width: `${Math.min((reviewTimes / 8) * 100, 100)}%` }} />
                          </div>
                          <span className={`font-semibold ${colors.text}`}>{reviewTimes} times</span>
                          {reviewTimes >= 8 && <FiStar className="ml-2 text-yellow-500" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {nextReviewDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {word.date_mastered}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Panel for Review Forecast */}
        <div className="bg-white shadow-lg rounded-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            <FiCalendar className="mr-3 text-purple-600" />
            Review Forecast
          </h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {reviewForecast.length > 0 ? reviewForecast.map(({ date, count, words }) => (
              <div 
                key={date}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-purple-100 cursor-pointer transition-colors"
                onClick={() => setModalData({ date, words })}
              >
                <span className="font-medium text-gray-700">{date}</span>
                <span className="px-3 py-1 text-sm font-semibold text-purple-800 bg-purple-200 rounded-full">
                  {count} words
                </span>
              </div>
            )) : (
              <p className="text-center text-gray-500 py-4">No upcoming reviews.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordOverviewPage;
