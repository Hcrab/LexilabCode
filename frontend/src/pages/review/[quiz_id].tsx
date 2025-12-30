"use client"
import { useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import AuthContext from '../../contexts/AuthContext'
import { formatToBeijingTime } from '../../lib/dateUtils'
import { ChevronRightIcon } from '@heroicons/react/24/solid'

interface Result {
  id: string;
  quiz_name: string;
  score: number;
  total_score: number;
  passed: boolean;
  ts: string;
}

export default function QuizAttempts() {
  const router = useRouter()
  const { user } = useContext(AuthContext)
  const { quiz_id } = router.query

  const [results, setResults] = useState<Result[]>([])
  const [quizName, setQuizName] = useState('');
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (router.isReady && user && quiz_id) {
      setIsLoading(true)
      fetch(`/api/results/quizzes/${quiz_id}?username=${user.username}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch attempts.');
          return res.json();
        })
        .then((data: Result[]) => {
          // Sort by most recent attempt first
          data.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
          setResults(data);
          if (data.length > 0) {
            setQuizName(data[0].quiz_name);
          }
        })
        .catch(err => setError(err.message))
        .finally(() => setIsLoading(false))
    }
  }, [router.isReady, user, quiz_id])

  if (isLoading) return <p className="p-6 text-center">Loading attempt history...</p>
  if (error) return <p className="p-6 text-center text-red-500">{error}</p>

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Review Attempts</h1>
      <h2 className="text-xl text-gray-600 mb-6">{quizName}</h2>
      
      {results.length === 0 && !isLoading && (
        <p className="text-center text-gray-500">No attempts found for this quiz.</p>
      )}

      <ul className="space-y-3">
        {results.map(result => (
          <li key={result.id} className="border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white">
            <Link href={`/review/attempt/${result.id}`} className="flex justify-between items-center p-4">
              <div>
                <p className="font-semibold text-lg text-gray-800">
                  Attempt on {formatToBeijingTime(result.ts)}
                </p>
                <p className={`text-md mt-1 font-medium ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                  Score: {result.score} / {result.total_score}
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