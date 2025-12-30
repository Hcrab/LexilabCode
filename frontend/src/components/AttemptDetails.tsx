interface Attempt {
  _id: string
  ts: string
  correct: number
  total: number
  details: {
    questions: any[]
  }
}

interface AttemptDetailsProps {
  attempt: Attempt
}

export default function AttemptDetails({ attempt }: AttemptDetailsProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">
        Attempt from {new Date(attempt.ts).toLocaleString()}
      </h2>
      <p className="mb-4">
        Score: {attempt.correct} / {attempt.total}
      </p>
      <div className="space-y-6">
        {attempt.details.questions.map((q, index) => (
          <div key={index} className="border p-4 rounded-md">
            <p className="font-semibold">Question {index + 1}: {q.word}</p>
            {q.type === 'fill-in-the-blank' && (
              <>
                <p>Your answer: {q.answer}</p>
                <p>Correct answer: {q.correctAnswer}</p>
              </>
            )}
            {q.type === 'sentence' && (
              <>
                <p>Your sentence: {q.sentence}</p>
                <p>Score: {q.score}</p>
                <p className="mt-2 text-sm text-gray-600">Feedback: {q.feedback}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
