"use client"
import { useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import AuthContext from '../contexts/AuthContext'
import { ChevronRightIcon } from '@heroicons/react/24/solid'
import { formatToBeijingTime } from '../lib/dateUtils'
import withAuth from '../components/withAuth'

interface ResultItem {
  id: number
  quiz_id: number
  quiz_name: string
  correct: number
  total: number
  passed: number
  ts: string
}

interface AggregatedQuiz {
  quiz_id: number
  quiz_name: string
  attempt_count: number
  last_attempt_ts: string
}

function Review() {
  const { user } = useContext(AuthContext)
  const [aggregatedQuizzes, setAggregatedQuizzes] = useState<AggregatedQuiz[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user) {
      setIsLoading(true)
      fetch(`/api/results?username=${user.username}`)
        .then(r => r.json())
        .then((items: ResultItem[]) => {
          const quizMap = new Map<number, AggregatedQuiz>()

          items.forEach(item => {
            const existing = quizMap.get(item.quiz_id)
            if (existing) {
              existing.attempt_count += 1
              // Keep the latest timestamp
              if (new Date(item.ts) > new Date(existing.last_attempt_ts)) {
                existing.last_attempt_ts = item.ts
              }
            } else {
              quizMap.set(item.quiz_id, {
                quiz_id: item.quiz_id,
                quiz_name: item.quiz_name,
                attempt_count: 1,
                last_attempt_ts: item.ts,
              })
            }
          })
          
          const sortedQuizzes = Array.from(quizMap.values()).sort(
            (a, b) => new Date(b.last_attempt_ts).getTime() - new Date(a.last_attempt_ts).getTime()
          );

          setAggregatedQuizzes(sortedQuizzes)
        })
        .catch(() => {})
        .finally(() => setIsLoading(false))
    }
  }, [user])

  if (!user) return <p className="p-6">Please login to see your review history.</p>
  if (isLoading) return <p className="p-6">Loading review history...</p>

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Review Past Quizzes</h1>
      
      {aggregatedQuizzes.length === 0 && !isLoading && (
        <p className="text-center text-gray-500">You have not completed any quizzes yet.</p>
      )}

      <ul className="space-y-3">
        {aggregatedQuizzes.map(quiz => (
          <li key={quiz.quiz_id} className="border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white">
            <Link href={`/review/${quiz.quiz_id}`} className="flex justify-between items-center p-4">
              <div>
                <p className="font-semibold text-lg text-gray-800">{quiz.quiz_name}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {quiz.attempt_count} {quiz.attempt_count > 1 ? 'attempts' : 'attempt'} - Last on {formatToBeijingTime(quiz.last_attempt_ts)}
                </p>
              </div>
              <ChevronRightIcon className="h-6 w-6 text-gray-400" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default withAuth(Review)