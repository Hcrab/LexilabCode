import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Reusable API utility
const api = {
  get: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
  },
  post: async (endpoint, body) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Request failed');
    }
    return response.json();
  }
};

// Main Dashboard Page (student search + invites + linked list)
const TeacherDashboard = () => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [linked, setLinked] = useState([]);
  const [error, setError] = useState('');
  const [sentInvites, setSentInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const tierLabel = (t) => {
    switch (t) {
      case 'tier_1': return 'High Performer';
      case 'tier_2': return 'Stable Growth';
      case 'tier_3':
      default: return 'Needs Support';
    }
  };

  const search = async () => {
    setLoading(true); setError('');
    try {
      const data = await api.get(`/api/admin/students/search?q=${encodeURIComponent(q)}`);
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Search failed');
    } finally { setLoading(false); }
  };

  const loadLinked = async () => {
    try {
      const data = await api.get('/api/admin/students/linked');
      setLinked(Array.isArray(data) ? data : []);
    } catch (_) {}
  };

  const loadSentInvites = async () => {
    try {
      const data = await api.get('/api/admin/invitations/sent');
      setSentInvites(Array.isArray(data) ? data : []);
    } catch (_) {}
  };

  useEffect(() => {
    loadLinked();
    loadSentInvites();
    const t = setInterval(() => { loadSentInvites(); }, 10000);
    return () => clearInterval(t);
  }, []);

  const invite = async (student) => {
    try {
      await api.post('/api/admin/invitations', { student_id: student._id });
      alert('Invitation sent');
      loadSentInvites();
    } catch (e) { alert(e.message || 'Failed to send'); }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-700">Search Students and Send Invites</h3>
        <div className="flex gap-3">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Enter student username" className="flex-1 p-3 rounded bg-gray-50 border" />
          <button onClick={search} className="px-4 py-2 bg-blue-600 text-white rounded">Search</button>
        </div>
        {loading && <p className="mt-3 text-sm text-gray-500">Searching...</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 space-y-2">
          {results.map(st => (
            <div key={st._id} className="p-3 rounded border flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">{st.username} {st.nickname ? `(${st.nickname})` : ''}</div>
                <div className="text-xs text-gray-600">{tierLabel(st.tier)}</div>
              </div>
              <button onClick={()=>invite(st)} className="px-3 py-1 bg-indigo-600 text-white rounded">Invite</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-700">Sent Invites</h3>
        {sentInvites.length === 0 ? (
          <p className="text-gray-500">No pending invites for students.</p>
        ) : (
          <div className="space-y-2">
            {sentInvites.map(inv => (
              <div key={inv._id} className="p-3 rounded border flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{inv.student?.username} {inv.student?.nickname ? `(${inv.student.nickname})` : ''}</div>
                  <div className="text-xs text-gray-600">Status: Awaiting student confirmation</div>
                </div>
                <div className="text-xs text-gray-400">{inv.created_at ? new Date(inv.created_at).toLocaleString() : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md mt-8">
        <h3 className="text-xl font-bold mb-4 text-gray-700">Linked Students</h3>
        {linked.length === 0 ? (
          <p className="text-gray-500">No linked students. Send invites and they’ll appear here after acceptance.</p>
        ) : (
          <div className="space-y-2">
            {linked.map(st => (
              <div key={st._id} className="p-3 rounded border flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{st.username} {st.nickname ? `(${st.nickname})` : ''}</div>
                  <div className="text-xs text-gray-600">{tierLabel(st.tier)}</div>
                </div>
                <button onClick={()=>navigate(`/admin/student/${st._id}`)} className="px-3 py-1 bg-green-600 text-white rounded">View & Assign</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
