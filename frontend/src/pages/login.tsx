"use client"
import { useState, useContext } from 'react'
import { useRouter } from 'next/router'
import AuthContext from '../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useContext(AuthContext)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const router = useRouter()

  const submit = async () => {
    const err = await login(username, password)
    if (err) {
      setError(err)
    } else {
      router.push('/')
    }
  }

  return (
    <main className="p-6 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Login</h1>
      <input className="border p-2 w-full" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input className="border p-2 w-full" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="px-4 py-2 bg-blue-600 text-white" onClick={submit}>Login</button>
      {error && <p className="text-red-600">{error}</p>}
      <div className="text-sm text-gray-600">
        Don't have an account?{' '}
        <button className="text-blue-600 underline" onClick={() => setShowRegister(true)}>Create one</button>
      </div>

      {showRegister && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <RegisterModal onClose={() => setShowRegister(false)} />
        </div>
      )}
    </main>
  )
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError(''); setSuccess(''); setLoading(true)
    try {
      if (!username.trim()) throw new Error('Please enter username')
      if (!password) throw new Error('Please enter password')
      if (password !== confirm) throw new Error('Passwords do not match')
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirm_password: confirm })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.message || 'Registration failed')
      setSuccess('Registered successfully. Please log in.')
    } catch (e: any) {
      setError(e?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <h2 className="text-xl font-bold mb-4">Create Account</h2>
      <div className="space-y-3">
        <input className="border p-2 w-full" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
        <input className="border p-2 w-full" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <input className="border p-2 w-full" type="password" placeholder="Confirm Password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
      </div>
      {(() => {
        const suppressed = error?.trim() === 'System limit of 300 users.'
        const msg = suppressed ? '' : error
        return msg ? <p className="text-red-600 mt-3">{msg}</p> : null
      })()}
      {success && <p className="text-green-600 mt-3">{success}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="px-4 py-2 bg-gray-200" onClick={onClose}>Close</button>
        <button className="px-4 py-2 bg-blue-600 text-white disabled:opacity-50" disabled={loading} onClick={submit}>{loading ? 'Submitting…' : 'Register'}</button>
      </div>
    </div>
  )
}
