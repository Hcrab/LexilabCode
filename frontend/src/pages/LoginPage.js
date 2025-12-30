import React, { useState } from 'react';

const passwordStrong = (pw) => {
  if (!pw || pw.length < 8) return false;
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  return hasLetter && hasDigit && hasSymbol;
};

// Registration modal (open to all users; teacher signup disabled)
const RegisterModal = ({ open, onClose }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  if (!open) return null;

  const submit = async () => {
    setError(''); setSuccess(''); setSubmitting(true);
    try {
      if (!username.trim()) throw new Error('Please enter username');
      if (!password) throw new Error('Please enter password');
      if (password !== confirmPassword) throw new Error('Passwords do not match');
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirm_password: confirmPassword })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Registration failed');
      setSuccess('Registered successfully. Please log in.');
    } catch (e) {
      setError(e?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-1">Create Account</h3>
        <p className="text-gray-600 mb-4">Only username and password required.</p>
        {(() => {
          const suppressed = (error || '').trim() === 'System limit of 300 users.';
          const msg = suppressed ? '' : error;
          return msg ? <div className="text-sm text-red-600 mb-2">{msg}</div> : null;
        })()}
        {success && <div className="text-sm text-green-600 mb-2">{success}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-gray-700 mb-1">Username</label>
            <input className="w-full p-3 border rounded bg-gray-50" placeholder="Enter username" value={username} onChange={e=>setUsername(e.target.value)} />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Password</label>
            <input className="w-full p-3 border rounded bg-gray-50" placeholder="Enter password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Confirm Password</label>
            <input className="w-full p-3 border rounded bg-gray-50" placeholder="Confirm password" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-between mt-6">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={onClose}>Close</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={submitting} onClick={submit}>{submitting ? 'Submitting…' : 'Register'}</button>
        </div>
      </div>
    </div>
  );
};

const LoginPage = ({ setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');
      localStorage.setItem('token', data.token); setToken(data.token); window.location.href = '/';
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-800 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-3xl font-extrabold text-gray-900 tracking-tight">Lexilab</div>
          <div className="text-sm text-gray-500 mt-1">Learn smarter. Practice better. Grow faster.</div>
        </div>
        <div className="bg-white/90 backdrop-blur p-8 rounded-2xl shadow-xl border border-gray-100">
          <h1 className="text-xl font-bold mb-6 text-center text-gray-800">Sign In</h1>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-600 mb-2" htmlFor="username">Username</label>
              <input id="username" type="text" value={username} onChange={(e)=>setUsername(e.target.value)} className="w-full p-3 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
            </div>
            <div className="mb-6">
              <label className="block text-gray-600 mb-2" htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full p-3 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-xl transition duration-200">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            {error && <p className="mt-4 text-red-600 text-center text-sm">{error}</p>}
          </form>
        </div>
        <div className="mt-4 text-center text-sm text-gray-700">
          <span>Don’t have an account? </span>
          <button className="text-blue-600 hover:underline" onClick={()=>setShowRegister(true)}>Create one</button>
        </div>
      </div>
      <RegisterModal open={showRegister} onClose={()=>setShowRegister(false)} />
    </div>
  );
};

export default LoginPage;
