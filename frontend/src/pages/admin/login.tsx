"use client"
import { useState, useContext, useEffect } from 'react'
import { useRouter } from 'next/router'
import AuthContext from '../../contexts/AuthContext'

export default function AdminLogin() {
  const { login, user } = useContext(AuthContext)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (user && user.role === 'admin') {
      router.push('/admin/dashboard');
    }
  }, [user, router]);

  const submit = async () => {
    const err = await login(username, password, true)
    if (err) setError(err)
    else router.push('/admin/dashboard')
  }

  if (user && user.role === 'admin') {
    return <div>Redirecting...</div>;
  }

  return (
    <main className="p-6 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Admin Login</h1>
      <input className="border p-2 w-full" placeholder="Admin Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input className="border p-2 w-full" type="password" placeholder="Admin Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="px-4 py-2 bg-blue-600 text-white" onClick={submit}>Login</button>
      {error && <p className="text-red-600">{error}</p>}
    </main>
  )
}
