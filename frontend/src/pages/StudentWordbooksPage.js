import React, { useEffect, useState } from 'react';
import ManagePrivateWordbooksModal from '../components/ManagePrivateWordbooksModal';
import CreatePrivateWordbookModal from '../components/CreatePrivateWordbookModal';

const StudentWordbooksPage = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasBook, setHasBook] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const token = () => localStorage.getItem('token');

  const createDefaultBook = async () => {
    const res = await fetch('/api/student/wordbooks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ title: 'My Favorites' })
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data?.message || 'Creation failed');
    return data;
  };

  const checkOrCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/wordbooks/mine', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      if (!Array.isArray(data) || data.length === 0) {
        await createDefaultBook();
        setHasBook(true);
      } else {
        setHasBook(true);
      }
      setOpen(true);
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkOrCreate();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">My Wordbooks</h1>
      {loading && <p className="text-gray-600">Initializing...</p>}
      {error && <p className="text-red-600 mb-2">{error}</p>}

      {/* 操作区 */}
      <div className="mb-4 flex gap-3">
        <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={() => setShowCreate(true)}>Create wordbook</button>
        {!open && hasBook && (
          <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={()=>setOpen(true)}>
            Open manager
          </button>
        )}
      </div>

      {/* 复用管理组件作为内容主体 */}
      <ManagePrivateWordbooksModal key={refreshKey} isOpen={open} onClose={() => setOpen(false)} />

      {/* 兜底：若失败且没有词库，允许手动创建。成功存在时隐藏按钮 */}
      {!loading && !hasBook && (
        <div className="mt-4">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded"
            onClick={async ()=>{ setError(''); try { await createDefaultBook(); setHasBook(true); setOpen(true); } catch(e){ setError(e?.message||'Creation failed'); } }}
          >
            Create personal wordbook
          </button>
        </div>
      )}

      {/* 新建词库弹窗 */}
      {showCreate && (
        <CreatePrivateWordbookModal 
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setHasBook(true); setOpen(true); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
};

export default StudentWordbooksPage;
