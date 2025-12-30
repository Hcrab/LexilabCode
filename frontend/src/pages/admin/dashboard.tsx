"use client"
import Link from 'next/link'
import withAdminAuth from '../../components/withAdminAuth'

function Dashboard() {
  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <ul className="list-disc pl-6 space-y-1">
        <li><Link className="text-blue-600 underline" href="/admin/users">User Management</Link></li>
        <li><Link className="text-blue-600 underline" href="/admin/quizzes">Quiz Management</Link></li>
        <li><Link className="text-blue-600 underline" href="/admin/analytics/platform">Platform Overview</Link></li>
      </ul>
    </main>
  )
}

export default withAdminAuth(Dashboard)
