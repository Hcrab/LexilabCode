import { useEffect, useState } from 'react'
import withAdminAuth from '../../../components/withAdminAuth'

import { authFetch } from '../../../lib/authFetch'

interface Data {
  user_count: number
  quiz_count: number
  completion_rate: number
  pass_rate: number
}

const API = process.env.NEXT_PUBLIC_API_BASE || '/api'

function OverviewPage() {
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    authFetch(`${API}/admin/stats/overview`).then(r => r.json()).then(setData)
  }, [])

  if (!data) return <p className="p-6">Loading...</p>

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold">Platform Overview</h1>
      <div>Users: {data.user_count}</div>
      <div>Quizzes: {data.quiz_count}</div>
      <div>Completion Rate: {data.completion_rate}%</div>
      <div>Pass Rate: {data.pass_rate}%</div>
    </main>
  )
}

export default withAdminAuth(OverviewPage)
