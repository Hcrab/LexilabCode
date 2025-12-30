import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CreateWordbookModal from '../../components/CreateWordbookModal';

const WordbookListPage = () => {
  const [wordbooks, setWordbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPrivate, setShowPrivate] = useState(() => {
    try { return localStorage.getItem('sa_show_private_wordbooks') !== '0'; } catch { return true; }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/superadmin') ? '/superadmin' : '/admin';

  const fetchWordbooks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/wordbooks', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch wordbooks');
      }

      const data = await response.json();
      setWordbooks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWordbooks();
  }, []);

  const handleWordbookCreated = (newWordbook) => {
    setWordbooks([...(wordbooks || []), newWordbook]);
  };

  const handleRename = async (wb) => {
    const title = window.prompt('Enter a new wordbook name', wb.title || '');
    if (title == null) return; // cancelled
    const v = title.trim();
    if (!v) { alert('Name cannot be empty'); return; }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/wordbooks/${wb._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: v })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Rename failed');
      setWordbooks((prev)=> (prev || []).map(x => x._id === wb._id ? { ...x, title: v } : x));
    } catch (e) {
      alert(e.message || 'Rename failed');
    }
  };

  const handleEditDescription = async (wb) => {
    const desc = window.prompt('Enter a new wordbook description (optional)', wb.description || '');
    if (desc === null) return; // cancelled
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/wordbooks/${wb._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ description: desc })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Update description failed');
      setWordbooks((prev)=> (prev || []).map(x => x._id === wb._id ? { ...x, description: desc } : x));
    } catch (e) {
      alert(e.message || 'Update description failed');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  if (error) {
    return <div className="text-center py-10 text-red-500">Error: {error}</div>;
  }

  const filtered = (wordbooks || []).filter(wb => showPrivate ? true : (wb.accessibility !== 'private'));

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Wordbooks</h1>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
              <input type="checkbox" checked={showPrivate} onChange={(e)=>{ const v=e.target.checked; setShowPrivate(v); try{ localStorage.setItem('sa_show_private_wordbooks', v ? '1':'0'); }catch{} }} />
              Show private wordbooks
            </label>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
            >
              Create new wordbook
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((wordbook) => (
            <div
              key={wordbook._id}
              className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow duration-300"
              onClick={() => navigate(`${basePath}/wordbooks/${wordbook._id}`)}
            >
              <h2 className="text-xl font-semibold text-blue-600">{wordbook.title}</h2>
              <p className="text-gray-600 mt-2">{wordbook.description}</p>
              {wordbook.accessibility === 'private' && (
                <div className="mt-2 inline-block text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Private</div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={(e)=>{ e.stopPropagation(); handleRename(wordbook); }}
                  className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                >Rename</button>
                <button
                  onClick={(e)=>{ e.stopPropagation(); handleEditDescription(wordbook); }}
                  className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                >Edit description</button>
                <button
                  onClick={(e)=>{ e.stopPropagation(); navigate(`${basePath}/wordbooks/${wordbook._id}`); }}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >Manage</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <CreateWordbookModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onWordbookCreated={handleWordbookCreated}
      />
    </>
  );
};

export default WordbookListPage;
