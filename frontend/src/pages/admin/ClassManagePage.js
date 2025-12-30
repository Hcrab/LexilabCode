import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

const ClassManagePage = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  // 加入班级入口已移除
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await api('GET', '/api/classes');
      setClasses(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createClass = async () => {
    if (!newName.trim()) { setError('Please enter a class name'); return; }
    try {
      setCreating(true); setError('');
      await api('POST', '/api/classes', { name: newName.trim() });
      setNewName('');
      setNotice('Class created');
      setTimeout(()=>setNotice(''), 3000);
      await load();
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Class Management</h3>
        {notice && <div className="text-green-600 mb-3">{notice}</div>}
        {error && <div className="text-red-600 mb-3">{error}</div>}
        <div>
          <div className="font-semibold mb-2">Create Class</div>
          <div className="flex gap-2 max-w-xl">
            <input className="flex-1 border rounded p-2" placeholder="Enter class name" value={newName} onChange={e=>setNewName(e.target.value)} />
            <button className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50" disabled={creating} onClick={createClass}>{creating? 'Creating…' : 'Create'}</button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold text-gray-800 mb-4">My Classes</h3>
        {loading ? (
          <div>Loading…</div>
        ) : classes.length === 0 ? (
          <div className="text-gray-600">No classes yet. Create or join a class first.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map(c => (
              <div key={c._id} className="p-4 rounded-xl border hover:shadow cursor-pointer" onClick={()=>navigate(`/admin/class/${c._id}`)}>
                <div className="font-semibold text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-600 mt-1">Students: {(c.students||[]).length}</div>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={(e)=>{e.stopPropagation(); navigate(`/admin/class/${c._id}`);}}>Enter</button>
                  <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={(e)=>{e.stopPropagation(); navigate(`/admin/class/${c._id}/invite`);}}>Invite students</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassManagePage;
