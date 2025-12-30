import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiTrash2 } from 'react-icons/fi';

const API = '/api';

const formatToBeijingTime = (isoString, dateOnly = false) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' })
    }).format(d);
  } catch (_) {
    return isoString;
  }
};

export default function MyBookmarksPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/user/saved-questions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load bookmarks');
      setItems(Array.isArray(j) ? j : []);
    } catch (e) {
      setError(e.message || 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (it) => {
    if (!window.confirm('Remove this bookmark?')) return;
    try {
      const r = await fetch(`${API}/user/bookmark-question`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ result_id: it.result_id, question_index: it.question_index })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Delete failed');
      load();
    } catch (e) {
      alert(e.message || 'Delete failed');
    }
  };

  if (loading) return <p className="p-6 text-center">Loading bookmarks...</p>;
  if (error) return <p className="p-6 text-center text-red-500">Error: {error}</p>;

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">My Bookmarks</h1>

      {items.length === 0 ? (
        <p className="text-center text-gray-500">You haven’t saved any questions yet.</p>
      ) : (
        <div className="space-y-4">
          {items.map((b) => {
            const isFillInBlank = !!b?.correct_answer;
            const prompt = (b?.question_prompt || '').replace('___', `[${b?.word || ''}]`) || (b?.word ? `Sentence for "${b.word}"` : 'Question');
            return (
              <div key={b._id} className="p-4 border rounded-lg bg-white shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="flex-grow">
                    <p className="text-sm text-gray-500 mb-2">
                      From Quiz: <span className="font-semibold">{b.quiz_name || (b.quiz_id ? `Quiz ID: ${b.quiz_id}` : 'Quiz')}</span>
                    </p>
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-600">Question:</p>
                      <p className="text-lg font-semibold text-gray-800 mt-1">{prompt}</p>
                    </div>
                    <div className="space-y-2">
                      {isFillInBlank ? (
                        <>
                          <p>Your Answer: <span className="font-mono p-1 bg-gray-100 text-gray-800 rounded">{b.user_answer || 'N/A'}</span></p>
                          <p>Correct Answer: <span className="font-mono p-1 bg-green-100 text-green-800 rounded">{b.correct_answer}</span></p>
                        </>
                      ) : (
                        <>
                          <p>Your Answer: <span className="font-mono p-1 bg-gray-100 text-gray-800 rounded">{b.user_answer || 'N/A'}</span></p>
                          {b.ai_feedback && (
                            <div className="mt-2 text-sm text-blue-700 p-2 bg-blue-100 rounded">
                              <strong>AI Feedback:</strong> {b.ai_feedback}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(b)} className="text-gray-400 hover:text-red-600 ml-4 flex-shrink-0" title="Remove bookmark">
                    <FiTrash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t flex justify-between items-center">
                  <p className="text-xs text-gray-400">Saved at: {formatToBeijingTime(b.created_at)}</p>
                  {b.result_id ? (
                    <Link to={`/review/attempt/${b.result_id}`} className="text-sm font-medium text-blue-600 hover:underline">View Attempt</Link>
                  ) : (
                    <span className="text-xs text-gray-400">No attempt link</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
