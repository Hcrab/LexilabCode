import React, { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

const SuperAdminDashboard = () => {
  const [dau, setDau] = useState([]);
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [approving, setApproving] = useState({}); // id -> bool
  const [error, setError] = useState('');
  const [impersonateName, setImpersonateName] = useState('');
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${t}` };
    const run = async () => {
      setError('');
      try {
        const [dRes, uRes] = await Promise.all([
          fetch('/api/superadmin/dau', { headers }),
          fetch('/api/superadmin/users', { headers })
        ]);
        const d = dRes.ok ? await dRes.json() : [];
        const u = uRes.ok ? await uRes.json() : [];
        setDau(Array.isArray(d) ? d : []);
        setUsers(Array.isArray(u) ? u : []);
      } catch (e) {
        setError(e?.message || 'Failed to load');
      }
    };
    run();
    // Load pending teachers initially
    loadPending();
  }, []);

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const t = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${t}` };
      const r = await fetch('/api/superadmin/pending-teachers', { headers });
      const j = await r.json().catch(() => ([]));
      if (!r.ok) throw new Error(j?.message || 'Failed to load pending teachers');
      setPending(Array.isArray(j) ? j : []);
    } catch (e) {
      setError(e?.message || 'Failed to load pending teachers');
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  };

  const approve = async (it) => {
    const id = it.user_id || it._id || it.username;
    setApproving(prev => ({ ...prev, [id]: true }));
    try {
      const t = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
      const body = it.user_id ? { user_id: it.user_id } : { username: it.username };
      const r = await fetch('/api/superadmin/approve-teacher', { method: 'POST', headers, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || 'Approve failed');
      // Refresh list
      await loadPending();
    } catch (e) {
      alert(e?.message || 'Approve failed');
    } finally {
      setApproving(prev => ({ ...prev, [id]: false }));
    }
  };

  const loginAs = async ({ username, user_id }) => {
    if (!username && !user_id) {
      alert('Provide a username');
      return;
    }
    setImpersonating(true);
    try {
      const t = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
      const body = user_id ? { user_id } : { username };
      const r = await fetch('/api/superadmin/impersonate', { method: 'POST', headers, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || 'Failed to impersonate');
      const token = j?.token;
      if (!token) throw new Error('No token returned');
      localStorage.setItem('token', token);
      // Decide where to go based on role in token (fallback to returned role)
      let role = j?.role;
      try { role = jwtDecode(token)?.role || role; } catch {}
      if (role === 'admin') window.location.href = '/admin/dashboard';
      else if (role === 'superadmin') window.location.href = '/superadmin/dashboard';
      else window.location.href = '/student/dashboard';
    } catch (e) {
      alert(e?.message || 'Impersonation failed');
    } finally {
      setImpersonating(false);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">Super Admin Overview</h1>
      {error && <div className="text-red-600">{error}</div>}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-3">Direct Login (Impersonate)</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={impersonateName}
            onChange={(e)=>setImpersonateName(e.target.value)}
            placeholder="Enter username"
            className="px-3 py-2 border rounded w-64"
          />
          <button
            disabled={impersonating || !impersonateName}
            onClick={() => loginAs({ username: impersonateName })}
            className={`px-3 py-2 rounded text-white ${impersonating || !impersonateName ? 'bg-gray-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {impersonating ? 'Logging in…' : 'Login as'}
          </button>
          <div className="text-xs text-gray-500">Logs in as the specified account and redirects to its dashboard.</div>
        </div>
      </div>
      <div id="pending-teachers" className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Pending Teacher Approvals</h2>
          <button onClick={loadPending} className="px-3 py-1.5 text-sm bg-gray-100 border rounded hover:bg-gray-200">Refresh</button>
        </div>
        {pendingLoading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="text-gray-500 text-sm">No pending teacher accounts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Username</th>
                  <th className="p-2">Created at</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(it => {
                  const key = it.user_id || it.username;
                  const isBusy = !!approving[key];
                  return (
                    <tr key={key} className="border-b">
                      <td className="p-2 font-medium">{it.username}</td>
                      <td className="p-2">{it.created_at || '—'}</td>
                      <td className="p-2">{it.approved ? 'Approved' : 'Pending'}</td>
                      <td className="p-2">
                        <button
                          disabled={isBusy}
                          onClick={() => approve(it)}
                          className={`px-3 py-1.5 rounded ${isBusy ? 'bg-gray-300 text-gray-600' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >
                          {isBusy ? 'Approving…' : 'Approve'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">DAU (last 14 days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {dau.map((d) => (
            <div key={d.date} className="p-3 border rounded">
              <div className="text-sm text-gray-500">{d.date}</div>
              <div className="text-lg font-bold">{d.active_users}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent User Logins</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Username</th>
                <th className="p-2">Role</th>
                <th className="p-2">Tier</th>
                <th className="p-2">Last login time</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b">
                  <td className="p-2">{u.username}</td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2">{u.tier || '—'}</td>
                  <td className="p-2">{u.last_login || 'Never'}</td>
                  <td className="p-2">
                    <button
                      onClick={() => loginAs({ username: u.username, user_id: u.id })}
                      className="px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Login as
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
