"use client"
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import withAuth from '../../components/withAuth'

interface Data {
  completion_rate: number
  pass_rate: number
  avg_time: number
  questions: Record<string, { correct: number; incorrect: number }>
}

const COLORS = ['#4ade80', '#f87171']

function QuizStats() {
  const router = useRouter()
  const { id } = router.query
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    if (id) {
      fetch(`/api/stats/quizzes/${id}`).then(r => r.json()).then(setData)
    }
  }, [id])

  if (!id || !data) return <p className="p-6">Loading...</p>

  const questionEntries = Object.entries(data.questions || {})

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Quiz Statistics</h1>
      <div>Completion Rate: {data.completion_rate}%</div>
      <div>Pass Rate: {data.pass_rate}%</div>
      <div>Average Time: {data.avg_time}s</div>
      {questionEntries.map(([idx, val]) => (
        <div key={idx} className="border p-3">
          <div className="font-medium mb-2">Question {Number(idx) + 1}</div>
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie data={[{name:'Correct',value:val.correct},{name:'Incorrect',value:val.incorrect}]}
                   dataKey="value" cx="50%" cy="50%" outerRadius={80} label>
                {[val.correct, val.incorrect].map((_,i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      ))}
    </main>
  )
}

export default withAuth(QuizStats)