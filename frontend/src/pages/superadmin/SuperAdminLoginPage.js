import React, { useState } from 'react';

const SuperAdminLoginPage = ({ setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/superadmin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Login failed');
      localStorage.setItem('token', data.token); setToken(data.token);
      window.location.href = '/superadmin/dashboard';
    } catch (e1) { setError(e1.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-center mb-6">Super Admin Login</h1>
        <form onSubmit={doLogin}>
          <div className="mb-4">
            <label className="block text-gray-600 mb-2">Username</label>
            <input className="w-full p-3 border rounded bg-gray-50" value={username} onChange={e=>setUsername(e.target.value)} required />
          </div>
          <div className="mb-6">
            <label className="block text-gray-600 mb-2">Password</label>
            <input type="password" className="w-full p-3 border rounded bg-gray-50" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl" disabled={loading}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
          {error && <div className="text-red-600 text-center mt-3">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default SuperAdminLoginPage;
