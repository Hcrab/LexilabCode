"use client"
import { useEffect, useState } from 'react'

interface Quiz {
  id: number
  name: string
  type: string
}

export default function QuizList() {
  const [list, setList] = useState<Quiz[]>([])

  useEffect(() => {
    fetch('/api/quizzes').then(r => r.json()).then(setList).catch(() => {})
  }, [])

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">All Quizzes</h1>
      <table className="min-w-full text-left border">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2">ID</th>
            <th className="p-2">Name</th>
            <th className="p-2">Type</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map(q => (
            <tr key={q.id} className="border-b">
              <td className="p-2">{q.id}</td>
              <td className="p-2">{q.name}</td>
              <td className="p-2">{q.type}</td>
              <td className="p-2">
                <a href={`/quiz/${q.id}`} className="text-blue-600 underline">Take</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
