import Link from 'next/link'
import { useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import AuthContext from '../contexts/AuthContext'

export default function Nav() {
  const { user, logout } = useContext(AuthContext)
  const router = useRouter()
  const [hasClass, setHasClass] = useState<boolean | null>(null)

  // For student users, detect if they are in any class and hide quiz-related links when not
  useEffect(() => {
    const load = async () => {
      try {
        if (!user || (user.role !== 'user' && user.role !== 'my admin')) { setHasClass(null); return }
        const token = localStorage.getItem('token')
        if (!token) { setHasClass(null); return }
        const r = await fetch('/api/student/dashboard-summary', { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) { setHasClass(null); return }
        const data = await r.json().catch(() => ({}))
        setHasClass(Boolean(data?.has_teacher))
      } catch (_) {
        setHasClass(null)
      }
    }
    load()
  }, [user])

  if (router.pathname === '/403') return null
  if (!user) return null

  if (user.role === 'admin' || user.role === 'my admin') {
    return (
      <nav className="p-4 bg-gray-800 text-white space-x-4">
        <Link href="/admin/dashboard">Dashboard</Link>
        <Link href="/admin/users">Users</Link>
        <Link href="/admin/quizzes">Quizzes</Link>
        <Link href="/admin/analytics/platform">Platform Overview</Link>
        <Link href="/admin/analytics/user-insights">User Insights</Link>
        <Link href="/admin/analytics/quiz-analytics">Quiz Analytics</Link>
        <Link href="/admin/profile">My Profile</Link>
        <button onClick={logout} className="ml-4 underline">Logout</button>
      </nav>
    )
  }

  return (
    <nav className="p-4 bg-blue-600 text-white space-x-4">
      {hasClass !== false && <Link href="/quiz-list">Quiz List</Link>}
      {hasClass !== false && <Link href="/review">Review</Link>}
      <Link href="/my-bookmarks">My Bookmarks</Link>
      <Link href="/my-progress">Progress Tracker</Link>
      <Link href="/my-profile">My Profile</Link>
      <button onClick={logout} className="ml-4 underline">Logout</button>
    </nav>
  )
}
